const API_BASE_URL = '/api';
const DEFAULT_TIMEOUT = 5000; // 5 秒超时

// 通用请求处理函数（带超时控制）
async function handleRequest<T>(url: string, options?: RequestInit, timeout: number = DEFAULT_TIMEOUT): Promise<T> {
  const token = localStorage.getItem('access_token');
  
  // 创建 AbortController 用于取消请求
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options?.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '请求失败' }));
      throw new Error(error.detail || '请求失败');
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('服务器无响应，请检查网络连接');
    }
    throw error;
  }
}

// 对话信息接口
export interface ChatSession {
  chat_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// 创建对话响应
export interface CreateChatResponse {
  chat_id: string;
  title: string;
  created_at: string;
}

// 对话列表响应
export interface ChatListResponse {
  chats: ChatSession[];
}

// 删除对话响应
export interface DeleteChatResponse {
  message: string;
  chat_id: string;
}

// 更新标题请求
export interface UpdateTitleRequest {
  title: string;
}

// 更新标题响应
export interface UpdateTitleResponse {
  chat_id: string;
  title: string;
}

// 获取对话列表
export async function getChatList(): Promise<ChatListResponse> {
  return handleRequest<ChatListResponse>(`${API_BASE_URL}/chat`);
}

// 创建新对话
export async function createChat(): Promise<CreateChatResponse> {
  return handleRequest<CreateChatResponse>(`${API_BASE_URL}/chat`, {
    method: 'POST',
  });
}

// 删除对话
export async function deleteChat(chatId: string): Promise<DeleteChatResponse> {
  return handleRequest<DeleteChatResponse>(`${API_BASE_URL}/chat/${chatId}`, {
    method: 'DELETE',
  });
}

// 更新对话标题
export async function updateChatTitle(
  chatId: string,
  title: string
): Promise<UpdateTitleResponse> {
  return handleRequest<UpdateTitleResponse>(`${API_BASE_URL}/chat/${chatId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

// 对话历史消息接口
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// 对话历史响应
export interface ChatHistoryResponse {
  chat_id: string;
  title: string;
  history: HistoryMessage[];
}

// 获取对话历史
export async function getChatHistory(chatId: string): Promise<ChatHistoryResponse> {
  return handleRequest<ChatHistoryResponse>(`${API_BASE_URL}/chat/${chatId}`);
}

// 流式对话请求参数
export interface ChatCompletionsRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  enable_thinking?: boolean;
}

// 流式响应 chunk 接口
export interface ChatChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      reasoning_content?: string;
    };
    finish_reason: string | null;
  }[];
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
}

// 错误响应接口
export interface ChatError {
  error: {
    message: string;
    type: string;
  };
}

/**
 * 流式对话 API
 * 使用 AbortController 允许取消请求
 */
export async function streamChatCompletions(
  chatId: string,
  request: ChatCompletionsRequest,
  signal: AbortSignal
): Promise<AsyncGenerator<ChatChunk | ChatError, void, unknown>> {
  const token = localStorage.getItem('access_token');
  
  const response = await fetch(`${API_BASE_URL}/chat/${chatId}/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: request.messages,
      enable_thinking: request.enable_thinking,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: '请求失败', type: 'http_error' } }));
    throw new Error(error.error?.message || '请求失败');
  }

  const reader = response.body!.getReader();

  const decoder = new TextDecoder();
  let buffer = '';

  // 创建异步生成器
  async function* generate() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // 解析 SSE 格式的数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后不完整的一行
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6);
            if (data === '[DONE]') {
              continue;
            }
            try {
              const chunk: ChatChunk | ChatError = JSON.parse(data);
              yield chunk;
            } catch (e) {
              console.error('解析 chunk 失败:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  return generate();
}