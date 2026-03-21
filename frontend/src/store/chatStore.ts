import { create } from 'zustand';

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
  currentModel: string;
  isLoadingChats: boolean;
  hasLoadedChats: boolean; // 是否已加载过对话列表
  isGenerating: boolean; // 是否正在生成回复
  chatTitle: string | null; // 当前对话标题
  error: string | null; // 错误信息
  
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
  setLoadingChats: (loading: boolean) => void;
  setHasLoadedChats: (loaded: boolean) => void;
  setIsGenerating: (generating: boolean) => void;
  setChatTitle: (title: string | null) => void;
  setError: (error: string | null) => void;
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
  currentModel: 'Qwen',
  isLoadingChats: false,
  hasLoadedChats: false,
  isGenerating: false,
  chatTitle: null,
  error: null,
  
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
  }),
}));
