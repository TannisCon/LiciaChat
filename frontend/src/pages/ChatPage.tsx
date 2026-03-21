import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore, type Message } from '../store/chatStore';
import { useAuth } from '../hooks/useAuth';
import { getChatHistory, streamChatCompletions } from '../services/chatApi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { markdownComponents } from '../components/markdown-components';
import {
  Send,
  StopCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  BarChart3,
  ArrowDown,
} from 'lucide-react';
import 'katex/dist/katex.min.css';


// 获取用户头像首字符
const getUserInitial = (username?: string): string => {
  if (!username) return 'U';
  return username.charAt(0).toUpperCase();
};

// 用户头像组件 - 使用 React.memo 优化
const UserAvatar = React.memo(({ 
  username, 
  size = 'md' 
}: { 
  username?: string; 
  size?: 'sm' | 'md' | 'lg' 
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };
  
  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0`}>
      <span className="text-white font-medium">{getUserInitial(username)}</span>
    </div>
  );
});

// 工具栏组件 - 使用 React.memo 优化
const MessageToolbar = React.memo(({
  isCopied,
  onCopy,
  hasUsage,
  isUsageExpanded,
  onToggleUsage,
  usage,
}: {
  isCopied: boolean;
  onCopy: () => void;
  hasUsage: boolean;
  isUsageExpanded: boolean;
  onToggleUsage: () => void;
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}) => {
  return (
    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
      <button
        onClick={onCopy}
        className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg transition-colors"
        title={isCopied ? '已复制' : '复制'}
      >
        {isCopied ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
      {hasUsage && (
        <button
          onClick={onToggleUsage}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg transition-colors"
          title="Token 统计"
        >
          <BarChart3 className="w-4 h-4" />
        </button>
      )}
      {hasUsage && isUsageExpanded && usage && (
        <div className="ml-2 flex gap-2 text-xs bg-zinc-700 rounded-lg px-2 py-1">
          <span className="text-zinc-400">
            生成：<span className="text-blue-400">{usage.completion_tokens}</span>
          </span>
          <span className="text-zinc-400">
            请求：<span className="text-green-400">{usage.prompt_tokens}</span>
          </span>
          <span className="text-zinc-400">
            总计：<span className="text-purple-400">{usage.total_tokens}</span>
          </span>
          {usage.completion_tokens_details?.reasoning_tokens !== undefined && (
            <span className="text-zinc-400">
              推理：<span className="text-orange-400">{usage.completion_tokens_details.reasoning_tokens}</span>
            </span>
          )}
          {usage.prompt_tokens_details?.cached_tokens !== undefined && (
            <span className="text-zinc-400">
              缓存：<span className="text-cyan-400">{usage.prompt_tokens_details.cached_tokens}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
});

// 推理内容折叠框组件 - 使用 React.memo 优化
const ReasoningContent = React.memo(({ content }: { content: string }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!content) return null;

  return (
    <div className="mb-3 rounded-xl border border-orange-500/30 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-400" />
          <span className="text-sm text-orange-400 font-medium">深度思考</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-orange-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-orange-400" />
        )}
      </button>
      {isExpanded && (
        <div className="px-3 py-3 bg-orange-500/5 text-sm text-zinc-300 whitespace-pre-wrap border-t border-orange-500/20">
          {content}
        </div>
      )}
    </div>
  );
});

// 消息项组件 - 使用 React.memo 优化，带自定义比较函数
const MessageItem = React.memo(({ message, userUsername, isStreaming }: { message: Message; userUsername?: string; isStreaming?: boolean }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [usageExpanded, setUsageExpanded] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  }, [message.content, message.id]);

  const isUser = message.role === 'user';

  // 主对话列表消息项组件，包含头像、角色名称、推理内容和主要内容
  return (
    <div
      className={`group rounded-xl px-4 py-6 max-w-4xl mx-auto hover:bg-zinc-700/50 transition-colors duration-200 ease-in-out`}
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start gap-4">
          {/* 头像 */}
          <div className="flex-shrink-0">
            {isUser ? (
              <UserAvatar username={userUsername} size="md" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
            )}
          </div>

          {/* 消息内容 */}
          <div className="flex-1 min-w-0">
            {/* 角色名称 */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-zinc-200">
                {isUser ? userUsername : 'AI 助手'}
              </span>
            </div>

            {/* 推理内容（如果有） */}
            {message.reasoning_content && (
              <ReasoningContent content={message.reasoning_content} />
            )}

            {/* 主要内容 */}
            <div className="relative">
              {isUser ? (
                // 用户消息：纯文本显示，不进行 Markdown 解析
                <div className="whitespace-pre-wrap break-words text-zinc-100/90 leading-relaxed">
                  {message.content}
                </div>
              ) : message.content ? (
                // AI 回复：进行 Markdown 解析和代码块渲染
                <div className="prose prose-invert max-w-none text-zinc-100/90 leading-relaxed break-words overflow-x-auto">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeRaw, rehypeKatex]}
                    components={markdownComponents}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : isStreaming ? (
                // AI 消息正在等待首 token：显示蓝色加载图标
                <div className="flex items-center gap-2 text-blue-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">正在生成...</span>
                </div>
              ) : (
                // AI 消息为空但未在生成状态
                <div className="text-zinc-100/80 leading-loose">
                  {message.content}
                </div>
              )}

              {/* 工具栏：仅对 AI 回复显示 */}
              {!isUser && message.content && (
                <div className="mt-2">
                  <MessageToolbar
                    isCopied={copiedId === message.id}
                    onCopy={handleCopy}
                    hasUsage={!!message.usage}
                    isUsageExpanded={usageExpanded}
                    onToggleUsage={() => setUsageExpanded(!usageExpanded)}
                    usage={message.usage}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数：只有当消息内容和推理内容都相同时才跳过重渲染
  return prevProps.message.id === nextProps.message.id &&
         prevProps.message.content === nextProps.message.content &&
         prevProps.message.reasoning_content === nextProps.message.reasoning_content &&
         prevProps.message.usage === nextProps.message.usage &&
         prevProps.userUsername === nextProps.userUsername;
});

// 加载状态组件 - 使用 React.memo 优化
const LoadingMessage = React.memo(() => {
  return (
    <div className="px-4 py-6 bg-transparent">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-zinc-200">AI 助手</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>正在思考...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// 错误消息组件 - 使用 React.memo 优化
const ErrorMessage = React.memo(({ message }: { message: string }) => {
  return (
    <div className="px-4 py-6 bg-transparent">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-red-600/20 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400">
              {message}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// 空状态组件 - 使用 React.memo 优化
const EmptyState = React.memo(() => {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-purple-400" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-200 mb-2">
          开始与 AI 对话
        </h2>
        <p className="text-zinc-400 max-w-md">
          在下方输入框中输入您的问题，AI 助手将为您提供帮助
        </p>
      </div>
    </div>
  );
});

// 主聊天页面组件
export const ChatPage: React.FC = () => {
  const {
    currentChatId,
    messages,
    setMessages,
    addMessage,
    updateMessage,
    removeLastMessage,
    thinkingMode,
    setThinkingMode,
    isGenerating,
    setIsGenerating,
    setChatTitle,
    setError,
    error,
    refreshChatList,
  } = useChatStore();

  const { isAuthenticated, user } = useAuth();
  const [inputValue, setInputValue] = useState('');
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  // 滚动相关状态
  const [autoScroll, setAutoScroll] = useState(true); // 是否自动滚动
  const [showScrollButton, setShowScrollButton] = useState(false); // 是否显示回到底部按钮
  
  // 检测是否在底部的阈值（像素）
  const BOTTOM_THRESHOLD = 80;
  
  // 防抖定时器 ref
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 检查是否在底部
  const checkIsAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    return distanceToBottom <= BOTTOM_THRESHOLD;
  }, []);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setAutoScroll(true);
  }, []);

  // 处理滚动事件
  const handleScroll = useCallback(() => {
    // 防抖处理
    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current);
    }
    
    const atBottom = checkIsAtBottom();
    
    // 立即更新 autoScroll，防止自动滚动
    if (!atBottom) {
      setAutoScroll(false);
    } else {
      setAutoScroll(true);
      setShowScrollButton(false);
    }
    
    // 防抖更新按钮显示
    scrollDebounceRef.current = setTimeout(() => {
      if (!atBottom) {
        setShowScrollButton(true);
      }
    }, 100);
  }, [checkIsAtBottom]);

  // 监听消息变化和生成状态，自动滚动
  useEffect(() => {
    if (autoScroll) {
      scrollToBottom();
    }
  }, [messages, isGenerating, autoScroll, scrollToBottom]);

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current);
      }
    };
  }, []);

  // 监听生成完成，延迟刷新对话列表
  useEffect(() => {
    if (!isGenerating && messages.length > 0) {
      // 检查最后一条消息是否是助手消息且有内容（表示生成完成）
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'assistant' && lastMessage.content) {
        // 延迟 1 秒刷新对话列表
        const timer = setTimeout(() => {
          refreshChatList();
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [isGenerating, messages, refreshChatList]);

  // 加载对话历史
  const loadChatHistory = useCallback(async () => {
    if (!currentChatId) {
      setMessages([]);
      return;
    }

    try {
      const response = await getChatHistory(currentChatId);
      const historyMessages: Message[] = response.history.map((msg, index) => ({
        id: `history-${index}`,
        role: msg.role,
        content: msg.content,
        timestamp: Date.now(),
      }));
      setMessages(historyMessages);
      setChatTitle(response.title);
      setError(null);
    } catch (err) {
      console.error('加载对话历史失败:', err);
      setError(err instanceof Error ? err.message : '加载对话历史失败');
    }
  }, [currentChatId, setMessages, setChatTitle, setError]);

  useEffect(() => {
    if (isAuthenticated && currentChatId) {
      loadChatHistory();
    }
  }, [isAuthenticated, currentChatId, loadChatHistory]);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || !currentChatId || isGenerating) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    
    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    // 重新聚焦到输入框，保持焦点不丢失
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);

    // 添加用户消息
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    setIsGenerating(true);
    setError(null);

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    // 添加助手消息占位
    const assistantMsgId = `assistant-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning_content: '',
      timestamp: Date.now(),
    };
    addMessage(assistantMsg);

    try {
      // 构建请求消息（包含历史）
      const requestMessages = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
      requestMessages.push({ role: 'user', content: userMessage });

      // 调用流式 API
      const stream = await streamChatCompletions(
        currentChatId,
        {
          messages: requestMessages,
          enable_thinking: thinkingMode,
        },
        abortControllerRef.current.signal
      );

      let reasoningContent = '';
      let content = '';
      let usage = null;
      let hasError = false;

      // 处理流式响应
      for await (const chunk of stream) {
        // 检查是否是错误响应
        if ('error' in chunk) {
          hasError = true;
          setError(chunk.error.message || '请求失败');
          break;
        }

        // 检查 finish_reason
        if (chunk.choices[0]?.finish_reason) {
          if (chunk.choices[0].finish_reason !== 'stop') {
            hasError = true;
            setError(`生成异常：${chunk.choices[0].finish_reason}`);
            break;
          }
        }

        // 解析 delta
        const delta = chunk.choices[0]?.delta;
        if (delta) {
          if (delta.reasoning_content) {
            reasoningContent += delta.reasoning_content;
            updateMessage(assistantMsgId, { reasoning_content: reasoningContent });
          }
          if (delta.content) {
            content += delta.content;
            updateMessage(assistantMsgId, { content });
          }
        }

        // 解析 usage（完整传递，包含 details 信息）
        if (chunk.usage) {
          usage = chunk.usage;
        }
      }

      // 如果有 usage 信息，更新消息
      if (usage && !hasError) {
        updateMessage(assistantMsgId, { usage });
      }

      // 如果发生错误，移除助手消息
      if (hasError) {
        removeLastMessage();
      }
    } catch (err) {
      console.error('流式请求失败:', err);
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || '请求失败');
        removeLastMessage();
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [
    inputValue,
    currentChatId,
    isGenerating,
    thinkingMode,
    messages,
    addMessage,
    updateMessage,
    removeLastMessage,
    setIsGenerating,
    setError,
  ]);

  // 停止生成
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
  }, [setIsGenerating]);

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // 正在生成时，不响应 Enter 发送请求
        if (isGenerating) return;
        e.preventDefault();
        handleSend();
      }
      // Shift+Enter 换行行为由 textarea 默认处理
    },
    [handleSend, isGenerating]
  );

  // 自动调整 textarea 高度
  const handleTextareaInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const target = e.target;
      target.style.height = 'auto';
      const newHeight = Math.min(target.scrollHeight, 300);
      target.style.height = `${newHeight}px`;
      setInputValue(target.value);
    },
    []
  );

  if (!isAuthenticated) {
    return null;
  }

  const userUsername = user?.username || undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-900">
      {/* 消息列表 */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto relative"
        onScroll={handleScroll}
      >
        {messages.length === 0 && !error ? (
          <EmptyState />
        ) : (
          <>
            {messages.map((msg, index) => {
              // 判断是否是最后一条消息且正在生成中
              const isLastMessage = index === messages.length - 1;
              const isStreaming = isGenerating && isLastMessage && msg.role === 'assistant' && !msg.content;
              return (
                <MessageItem key={msg.id} message={msg} userUsername={userUsername} isStreaming={isStreaming} />
              );
            })}
            {isGenerating && messages[messages.length - 1]?.role === 'user' && (
              <LoadingMessage />
            )}
            {error && <ErrorMessage message={error} />}
            
            {/* 悬浮回到底部按钮 - 位于消息列表内部底部 */}
            {showScrollButton && (
              <div className="sticky bottom-4 flex justify-center pointer-events-none">
                <button
                  onClick={scrollToBottom}
                  className="pointer-events-auto flex items-center justify-center w-10 h-10 bg-blue-600/60 backdrop-blur-md border border-white/10 hover:bg-blue-500/90 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-110 active:scale-95"
                >
                  <ArrowDown className="w-5 h-5" />
                </button>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 输入区域 */}
      <div className="bg-zinc-900 px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {/* 输入框容器 */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="输入您的问题..."
              // disabled={isGenerating}
              rows={3}
              className="w-full bg-zinc-800 text-zinc-100 rounded-xl px-3 py-2 pr-14 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-700 scrollbar-gutter-stable"
              style={{ 
                minHeight: '80px', 
                maxHeight: '300px',
                scrollbarGutter: 'stable',
              }}
            />
            <button
              onClick={isGenerating ? handleStop : handleSend}
              disabled={!inputValue.trim() && !isGenerating}
              className={`absolute right-3 bottom-4 p-2.5 rounded-lg transition-colors ${
                isGenerating
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : inputValue.trim()
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              }`}
            >
              {isGenerating ? (
                <StopCircle className="w-5 h-5" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* 底部工具栏：深度思考开关 + 提示 */}
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => setThinkingMode(!thinkingMode)}
              
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                thinkingMode
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-sm">深度思考</span>
            </button>
            <span className="text-xs text-zinc-500">
              按 Enter 发送，Shift+Enter 换行
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;