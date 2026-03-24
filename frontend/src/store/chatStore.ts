import { create } from 'zustand';
import type { Model } from '../services/chatApi';

// 消息接口
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning_content?: string; // 推理内容
  timestamp: number;
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

// 对话会话接口
export interface ChatSession {
  chat_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// 对话历史消息接口（后端返回格式）
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatState {
  // 当前状态
  currentChatId: string | null;
  sidebarOpen: boolean;
  messages: Message[];
  chatSessions: ChatSession[];
  thinkingMode: boolean;
  currentModel: string; // 当前模型
  // 模型列表状态（带请求状态管理）
  modelsState: {
    models: Model[];
    status: 'idle' | 'pending' | 'success' | 'error';
    error?: string;
    lastUpdated: number | null;
  };
  availableModels: Model[]; // 可用模型列表（保持兼容）
  fetchModels: () => Promise<void>; // 获取模型列表（带重试）
  isLoadingChats: boolean;
  hasLoadedChats: boolean; // 是否已加载过对话列表
  isGenerating: boolean; // 是否正在生成回复
  chatTitle: string | null; // 当前对话标题
  error: string | null; // 错误信息
  isLoadingModels: boolean; // 是否正在加载模型列表
  modelsError: string | null; // 模型列表加载错误
  
  // Actions
  setCurrentChatId: (id: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  removeLastMessage: () => void;
  setChatSessions: (sessions: ChatSession[]) => void;
  addChatSession: (session: ChatSession) => void;
  removeChatSession: (chatId: string) => void;
  updateChatSessionTitle: (chatId: string, title: string) => void;
  setThinkingMode: (enabled: boolean) => void;
  setCurrentModel: (model: string) => void;
  setAvailableModels: (models: Model[]) => void;
  setModelsState: (state: Partial<ChatState['modelsState']>) => void;
  setLoadingChats: (loading: boolean) => void;
  setHasLoadedChats: (loaded: boolean) => void;
  setIsGenerating: (generating: boolean) => void;
  setChatTitle: (title: string | null) => void;
  setError: (error: string | null) => void;
  setIsLoadingModels: (loading: boolean) => void;
  setModelsError: (error: string | null) => void;
  refreshChatList: () => Promise<void>; // 刷新对话列表（保持当前选中对话不变）
  reset: () => void; // 重置所有状态（用于登出）
}

export const useChatStore = create<ChatState>((set) => ({
  // 初始状态
  currentChatId: null,
  sidebarOpen: true,
  messages: [],
  chatSessions: [],
  thinkingMode: false,
  currentModel: 'qwen3.5-plus',
  modelsState: {
    models: [],
    status: 'idle',
    error: undefined,
    lastUpdated: null,
  },
  availableModels: [],
  isLoadingChats: false,
  hasLoadedChats: false,
  isGenerating: false,
  chatTitle: null,
  error: null,
  isLoadingModels: false,
  modelsError: null,
  
  // Actions
  setCurrentChatId: (id) => set({ currentChatId: id }),
  
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  
  setMessages: (messages) => set({ messages }),
  
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message] 
  })),
  
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map(msg => 
      msg.id === id ? { ...msg, ...updates } : msg
    )
  })),
  
  removeLastMessage: () => set((state) => ({
    messages: state.messages.slice(0, -1)
  })),
  
  setChatSessions: (sessions) => set({ chatSessions: sessions }),
  
  addChatSession: (session) => set((state) => ({
    chatSessions: [session, ...state.chatSessions],
    currentChatId: session.chat_id,
    chatTitle: session.title,
  })),
  
  removeChatSession: (chatId) => set((state) => ({
    chatSessions: state.chatSessions.filter(chat => chat.chat_id !== chatId),
    currentChatId: state.currentChatId === chatId ? null : state.currentChatId,
    chatTitle: state.currentChatId === chatId ? null : state.chatTitle,
  })),
  
  updateChatSessionTitle: (chatId, title) => set((state) => ({
    chatSessions: state.chatSessions.map(chat =>
      chat.chat_id === chatId ? { ...chat, title } : chat
    ),
    chatTitle: state.currentChatId === chatId ? title : state.chatTitle,
  })),
  
  setThinkingMode: (enabled) => set({ thinkingMode: enabled }),
  
  setCurrentModel: (model) => set({ currentModel: model }),
  
  setAvailableModels: (models) => set({ availableModels: models }),
  
  setModelsState: (state) => set((prev) => ({
    modelsState: { ...prev.modelsState, ...state },
  })),
  
  setIsLoadingModels: (loading) => set({ isLoadingModels: loading }),
  
  setModelsError: (error) => set({ modelsError: error }),
  
  // 获取模型列表（带重试机制）
  fetchModels: async () => {
    const state = useChatStore.getState();
    // 防止并行请求
    if (state.modelsState.status === 'pending') return;
    
    // 更新状态为 pending
    set((prev) => ({
      modelsState: { ...prev.modelsState, status: 'pending', error: undefined },
    }));
    
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { getModels } = await import('../services/chatApi');
        const modelList = await getModels();
        
        set({
          modelsState: {
            models: modelList.data,
            status: 'success',
            error: undefined,
            lastUpdated: Date.now(),
          },
          availableModels: modelList.data,
          modelsError: null,
        });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('未知错误');
        
        // HTTP 错误不重试
        if (lastError.name === 'HttpError') break;
        
        // 最后一次尝试失败
        if (attempt === maxRetries) break;
        
        // 指数退避等待
        const delay = 500 * Math.pow(2, attempt) + Math.random() * 300;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // 最终失败
    const errorMessage = lastError?.message || '连接服务器错误';
    set({
      modelsState: {
        models: [],
        status: 'error',
        error: errorMessage,
        lastUpdated: Date.now(),
      },
      modelsError: errorMessage,
    });
  },
  
  setLoadingChats: (loading) => set({ isLoadingChats: loading }),
  
  setHasLoadedChats: (loaded) => set({ hasLoadedChats: loaded }),
  
  setIsGenerating: (generating) => set({ isGenerating: generating }),
  
  setChatTitle: (title) => set({ chatTitle: title }),
  
  setError: (error) => set({ error }),
  
  // 刷新对话列表（保持当前选中对话不变）
  refreshChatList: async () => {
    const { getChatList } = await import('../services/chatApi');
    try {
      const chatListResponse = await getChatList();
      const sortedChats = chatListResponse.chats.sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      set({ chatSessions: sortedChats });
    } catch (error) {
      console.error('刷新对话列表失败:', error);
    }
  },
  
  // 重置所有状态（用于登出）
  reset: () => set({
    currentChatId: null,
    messages: [],
    chatSessions: [],
    chatTitle: null,
    error: null,
    isLoadingChats: false,
    hasLoadedChats: false,
    isGenerating: false,
    modelsState: {
      models: [],
      status: 'idle',
      error: undefined,
      lastUpdated: null,
    },
    availableModels: [],
    isLoadingModels: false,
    modelsError: null,
  }),
}));
