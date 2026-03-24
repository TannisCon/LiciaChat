import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useChatStore, type ChatSession } from '../store/chatStore';
import { useAuthStore, type UserInfo, useAuthStore as authStore } from '../store/authStore';
import { useAuth } from '../hooks/useAuth';
import {
  Plus,
  MessageSquare,
  Trash2,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  LogIn,
  MoreVertical,
  Loader2,
  ChevronDown,
  Check,
  AlertCircle,
} from 'lucide-react';
import LoginModal from './LoginModal';
import UserProfileModal from './UserProfileModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import EditTitleModal from './EditTitleModal';
import { getChatList, createChat, deleteChat, updateChatTitle, updateChatModel } from '../services/chatApi';
import { exportChat } from '../lib/chatExport';

interface UserSectionProps {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserInfo | null;
  onLoginClick: () => void;
  onProfileClick: () => void;
}

// 获取用户头像首字符
const getUserInitial = (username?: string): string => {
  if (!username) return 'U';
  return username.charAt(0).toUpperCase();
};

// 格式化模型名称：将"-"分隔的每个元素首字母大写（如果首字符是英文）
const formatModelName = (name: string): string => {
  return name.split('-').map(part => {
    if (part.length === 0) return part;
    const firstChar = part.charAt(0);
    // 如果首字符是英文字母，大写它
    if (/[a-zA-Z]/.test(firstChar)) {
      return firstChar.toUpperCase() + part.slice(1);
    }
    return part;
  }).join('-');
};

// 用户信息区域组件
const UserSection: React.FC<UserSectionProps> = ({
  isAuthenticated,
  isLoading,
  user,
  onLoginClick,
  onProfileClick,
}) => {
  if (isLoading) {
    return (
      <div className="p-4 border-t border-zinc-700">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-700/50">
          <div className="w-10 h-10 rounded-full bg-zinc-600 animate-pulse" />
          <div className="flex-1">
            <div className="h-4 bg-zinc-600 rounded w-24 animate-pulse mb-1" />
            <div className="h-3 bg-zinc-600 rounded w-16 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="p-4 border-t border-zinc-700">
        <button
          onClick={onLoginClick}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 transition-colors"
        >
          <LogIn className="w-5 h-5" />
          <span className="font-medium">请登录</span>
        </button>
      </div>
    );
  }

  const userInitial = getUserInitial(user.username);

  return (
    <div className="p-4">
      <button
        onClick={onProfileClick}
        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-700/50 transition-colors"
      >
        {/* 头像 - 蓝色渐变 + 用户名首字符 */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-medium">{userInitial}</span>
        </div>

        {/* 用户信息 */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-zinc-100 font-medium text-sm truncate">{user.username}</p>
          <p className="text-zinc-500 text-xs">UID: {user.uid}</p>
        </div>
      </button>
    </div>
  );
};

// 对话项组件
interface ChatItemProps {
  session: ChatSession;
  isSelected: boolean;
  onSelect: (chatId: string) => void;
  onDeleteClick: (chat: ChatSession) => void;
  onEditTitleClick: (chat: ChatSession) => void;
  onExportClick: (chat: ChatSession) => void;
}

const ChatItem: React.FC<ChatItemProps> = ({
  session,
  isSelected,
  onSelect,
  onDeleteClick,
  onEditTitleClick,
  onExportClick,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1 rounded-xl cursor-pointer transition-colors ${
        isSelected
          ? 'bg-zinc-700 text-zinc-100'
          : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200'
      }`}
      onClick={() => onSelect(session.chat_id)}
    >
      <MessageSquare className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 truncate text-sm">{session.title}</span>
      
      {/* 更多操作按钮 */}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-600 rounded transition-all"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        
        {/* 下拉菜单 */}
        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setShowMenu(false);
                setShowExportMenu(false);
              }}
            />
            <div className="absolute left-0 top-full mt-1 w-32 bg-zinc-700 rounded-lg shadow-xl border border-zinc-600 z-50">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onEditTitleClick(session);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-zinc-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>编辑标题</span>
              </button>
              {/* 导出对话选项 - 无分隔线 */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowExportMenu(!showExportMenu);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-600 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>导出对话</span>
                  </span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {/* 导出子菜单 */}
                {showExportMenu && (
                  <div className="absolute left-full top-0 ml-0 w-32 bg-zinc-700 rounded-r-lg shadow-xl border border-zinc-600 z-60">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowExportMenu(false);
                        setShowMenu(false);
                        onExportClick(session);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-600 rounded-r-lg transition-colors"
                    >
                      <span>导出为 JSON</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="border-t border-zinc-600"></div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onDeleteClick(session);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>删除</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// 侧边栏组件
const Sidebar: React.FC<{
  onLoginClick: () => void;
  onProfileClick: () => void;
  onCreateNewChat: () => Promise<void>;
  isCreatingChat: boolean;
  createCooldown: number;
  onDeleteChat: (chat: ChatSession) => void;
  onEditTitleClick: (chat: ChatSession) => void;
  onExportClick: (chat: ChatSession) => void;
  isAuthenticated: boolean;
  isLoadingChats: boolean;
  hasLoadedChats: boolean;
  chatSessions: ChatSession[];
  currentChatId: string | null;
}> = ({ 
  onLoginClick, 
  onProfileClick, 
  onCreateNewChat, 
  isCreatingChat, 
  createCooldown, 
  onDeleteChat,
  onEditTitleClick,
  onExportClick,
  isAuthenticated,
  isLoadingChats,
  hasLoadedChats,
  chatSessions,
  currentChatId,
}) => {
  const {
    sidebarOpen,
    toggleSidebar,
    setCurrentChatId,
  } = useChatStore();

  const { isLoading: isAuthLoading, user } = useAuthStore();

  if (!sidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        className="w-12 bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition-colors"
      >
        <ChevronRight className="w-5 h-5 text-zinc-400" />
      </button>
    );
  }

  return (
    <div className="w-72 bg-zinc-900 flex flex-col flex-shrink-0 transition-all duration-300" style={{ zIndex: 30 }}>
      {/* 顶部操作栏 */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <img src="/licia_32.png" alt="Licia Logo" className="w-8 h-8" />
              <span className="font-bold text-xl text-zinc-100">LiciaChat</span>
            </div>
            <span className="text-base text-blue-400 font-medium -mt-1 ml-5"> - 心似双丝网，轻绾千千结</span>
          </div>
          <button
            onClick={toggleSidebar}
            className="p-1.5 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* 新建对话按钮 */}
        <button
          onClick={onCreateNewChat}
          disabled={isCreatingChat || createCooldown > 0}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl transition-colors font-medium ${
            isCreatingChat || createCooldown > 0
              ? 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {isCreatingChat ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>创建中...</span>
            </>
          ) : createCooldown > 0 ? (
            <>
              <Plus className="w-5 h-5" />
              <span>新建对话 ({createCooldown}s)</span>
            </>
          ) : (
            <>
              <Plus className="w-5 h-5" />
              <span>新建对话</span>
            </>
          )}
        </button>
      </div>

      {/* 历史对话列表 */}
      <div className="flex-1 overflow-visible p-2 space-y-1">
        {isLoadingChats || !hasLoadedChats ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : chatSessions.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>暂无对话</p>
            <p className="text-xs mt-1">点击"新建对话"开始</p>
          </div>
        ) : (
          chatSessions.map((session) => (
            <ChatItem
              key={session.chat_id}
              session={session}
              isSelected={currentChatId === session.chat_id}
              onSelect={setCurrentChatId}
              onDeleteClick={onDeleteChat}
              onEditTitleClick={onEditTitleClick}
              onExportClick={onExportClick}
            />
          ))
        )}
      </div>

      {/* 用户信息区域 */}
      <UserSection
        isAuthenticated={isAuthenticated}
        isLoading={isAuthLoading}
        user={user}
        onLoginClick={onLoginClick}
        onProfileClick={onProfileClick}
      />

      {/* 底部信息 */}
      <div className="p-4 text-xs text-zinc-500">
        <p>© 2026 LiciaChat</p>
        <p className="mt-1">Powered by Qwen</p>
      </div>
    </div>
  );
};

// 主布局组件
export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentModel, setChatSessions, setCurrentChatId, chatSessions, isLoadingChats, currentChatId, availableModels, setCurrentModel } = useChatStore();
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [createCooldown, setCreateCooldown] = useState(0); // 创建倒计时（秒）
  
  // 模型选择下拉菜单状态
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);
  const [modelSwitchError, setModelSwitchError] = useState<string | null>(null);
  
  // 删除确认弹窗状态
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingChat, setDeletingChat] = useState<ChatSession | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'success' | 'error'>('idle');
  const [deleteError, setDeleteError] = useState<string>('');
  
  // 用于清理自动关闭定时器
  const deleteAutoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 编辑标题弹窗状态
  const [showEditTitleModal, setShowEditTitleModal] = useState(false);
  const [editingChat, setEditingChat] = useState<ChatSession | null>(null);

  const handleLoginSuccess = () => {
    setShowLoginModal(false);
  };

  // 获取 chat store 的 reset 方法
  const resetChatStore = useChatStore(state => state.reset);
  
  // 退出登录并刷新页面
  const handleLogoutAndRefresh = async () => {
    // 调用 useAuth 的 logout 函数，它内部会：
    // 1. 调用 logoutApi() 清除后端 refresh token cookie
    // 2. 调用 logoutStore() 清除 auth store 状态
    await logout();
    
    // 清除 chat store 状态（清除消息、对话列表等）
    resetChatStore();
    
    // 关闭弹窗
    setShowProfileModal(false);
    
    // 3 秒后刷新页面
    setTimeout(() => {
      window.location.reload();
    }, 3000);
  };

  // 创建新对话（通用方法）
  const doCreateChat = async () => {
    try {
      const newChat = await createChat();
      return newChat;
    } catch (error) {
      console.error('创建对话失败:', error);
      throw error;
    }
  };

  // 创建新对话（手动点击）
  const handleCreateNewChat = async () => {
    if (isCreatingChat || createCooldown > 0) return;
    
    setIsCreatingChat(true);
    
    // 设置 5 秒冷却时间
    setCreateCooldown(5);
    const cooldownInterval = setInterval(() => {
      setCreateCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    try {
      const newChat = await doCreateChat();
      // 创建成功后，获取最新的对话列表
      const chatListResponse = await getChatList();
      const sortedChats = chatListResponse.chats.sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setChatSessions(sortedChats);
      // 如果当前没有选中的对话，则自动选中新创建的对话
      if (!currentChatId) {
        setCurrentChatId(newChat.chat_id);
      }
    } catch (error) {
      console.error('创建对话失败:', error);
      alert('创建对话失败，请稍后重试');
    } finally {
      setIsCreatingChat(false);
      // 注意：冷却时间会继续倒计时，不在此处清除
    }
  };

  const { hasLoadedChats, setHasLoadedChats } = useChatStore();

  // 刷新对话列表
  const refreshChatList = useCallback(async () => {
    try {
      const chatListResponse = await getChatList();
      const sortedChats = chatListResponse.chats.sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setChatSessions(sortedChats);
      setHasLoadedChats(true);

      // 如果当前没有选中对话
      if (!useChatStore.getState().currentChatId && sortedChats.length > 0) {
        setCurrentChatId(sortedChats[0].chat_id); // 自动选择最近一个对话
      }
      
      // 如果对话列表为空，自动创建新对话并选中
      if (sortedChats.length === 0) {
        const newChat = await doCreateChat();
        // 刷新对话列表以包含新创建的对话
        const updatedChatListResponse = await getChatList();
        const updatedSortedChats = updatedChatListResponse.chats.sort((a, b) => 
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        setChatSessions(updatedSortedChats);
        // 自动选中新创建的对话
        setCurrentChatId(newChat.chat_id);
      }
    } catch (error) {
      console.error('刷新对话列表失败:', error);
    }
  }, [setChatSessions, setHasLoadedChats, setCurrentChatId]);

  // 用户登录后获取对话列表
  useEffect(() => {
    if (isAuthenticated) {
      refreshChatList();
    }
  }, [isAuthenticated, refreshChatList]);

  // 打开删除确认弹窗
  const handleDeleteClick = (chat: ChatSession) => {
    setDeletingChat(chat);
    setDeleteStatus('idle');
    setDeleteError('');
    setShowDeleteModal(true);
  };

  // 执行删除
  const handleDeleteConfirm = async () => {
    if (!deletingChat) return;
    
    setDeleteStatus('deleting');
    
    try {
      const deletedChatId = deletingChat.chat_id;
      await deleteChat(deletedChatId);
      setDeleteStatus('success');
      
      // 删除成功后立即刷新对话列表
      await refreshChatList();
      
      // 检查当前主对话区域的 chat_id 是否有效
      // 获取最新的 currentChatId（从 store 中读取）
      const latestCurrentChatId = useChatStore.getState().currentChatId;
      if (latestCurrentChatId === deletedChatId) {
        // 如果当前选中的对话被删除了，选中对话列表的第一条对话
        const newChatList = useChatStore.getState().chatSessions;
        if (newChatList.length > 0) {
          setCurrentChatId(newChatList[0].chat_id);
        } else {
          // 如果对话列表为空，清空当前选中
          setCurrentChatId(null);
        }
      }
      
      // 清除之前的定时器
      if (deleteAutoCloseTimerRef.current) {
        clearTimeout(deleteAutoCloseTimerRef.current);
      }
      
      // 3 秒后关闭弹窗
      deleteAutoCloseTimerRef.current = setTimeout(() => {
        setShowDeleteModal(false);
        setDeletingChat(null);
        setDeleteStatus('idle');
        deleteAutoCloseTimerRef.current = null;
      }, 3000);
    } catch (error) {
      console.error('删除对话失败:', error);
      setDeleteStatus('error');
      setDeleteError(error instanceof Error ? error.message : '服务器无响应');
      // 删除失败时刷新对话列表
      await refreshChatList();
    }
  };

  // 关闭删除弹窗
  const handleCloseDeleteModal = () => {
    if (deleteStatus !== 'deleting') {
      // 清除自动关闭定时器
      if (deleteAutoCloseTimerRef.current) {
        clearTimeout(deleteAutoCloseTimerRef.current);
        deleteAutoCloseTimerRef.current = null;
      }
      setShowDeleteModal(false);
      setDeletingChat(null);
      setDeleteStatus('idle');
      setDeleteError('');
    }
  };

  // 打开编辑标题弹窗
  const handleEditTitleClick = (chat: ChatSession) => {
    setEditingChat(chat);
    setShowEditTitleModal(true);
  };

  // 执行编辑标题
  const handleEditTitleConfirm = async (newTitle: string) => {
    if (!editingChat) return;
    
    const result = await updateChatTitle(editingChat.chat_id, newTitle);
    // 更新成功后刷新对话列表
    await refreshChatList();
    // 如果当前选中的对话是被编辑的对话，更新标题
    if (useChatStore.getState().currentChatId === editingChat.chat_id) {
      // 刷新对话历史以获取最新标题
      const { setChatTitle } = useChatStore.getState();
      setChatTitle(result.title);
    }
  };

  // 关闭编辑标题弹窗
  const handleCloseEditTitleModal = () => {
    setEditingChat(null);
    setShowEditTitleModal(false);
  };

  // 处理导出对话
  const handleExportClick = async (chat: ChatSession) => {
    try {
      await exportChat(chat.chat_id);
    } catch (error) {
      console.error('导出对话失败:', error);
      alert('导出对话失败，请稍后重试');
    }
  };

  // 切换模型
  const handleSwitchModel = async (modelId: string) => {
    if (!currentChatId || modelId === currentModel) {
      setShowModelMenu(false);
      return;
    }

    setIsSwitchingModel(true);
    setModelSwitchError(null);

    try {
      await updateChatModel(currentChatId, modelId);
      setCurrentModel(modelId);
      setShowModelMenu(false);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '切换模型失败';
      setModelSwitchError(errorMsg);
      // 3 秒后清除错误
      setTimeout(() => setModelSwitchError(null), 3000);
    } finally {
      setIsSwitchingModel(false);
    }
  };

  // 用户登录后加载模型列表（使用 store 中的 fetchModels）
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const state = useChatStore.getState();
    // 只在 idle 或 error 状态时请求
    if (state.modelsState.status === 'idle' || state.modelsState.status === 'error') {
      state.fetchModels();
    }
  }, [isAuthenticated]);

  // 监听模型列表加载错误并显示 Toast
  useEffect(() => {
    // 订阅 store 中 modelsState 的变化
    const unsubscribe = useChatStore.subscribe(
      (state) => {
        const modelsState = state.modelsState;
        if (modelsState.status === 'error' && modelsState.error) {
          setModelSwitchError(modelsState.error);
          // 3 秒后清除错误
          const timer = setTimeout(() => setModelSwitchError(null), 3000);
          return () => clearTimeout(timer);
        }
      }
    );
    return unsubscribe;
  }, []);

  // 获取当前模型显示名称
  const getCurrentModelName = () => {
    if (!availableModels.length) return formatModelName(currentModel);
    const model = availableModels.find(m => m.id === currentModel);
    return model ? formatModelName(model.id) : formatModelName(currentModel);
  };

  return (
    <div className="h-screen flex bg-zinc-900">
      {/* 侧边栏 */}
      <Sidebar
        onLoginClick={() => setShowLoginModal(true)}
        onProfileClick={() => setShowProfileModal(true)}
        onCreateNewChat={handleCreateNewChat}
        isCreatingChat={isCreatingChat}
        createCooldown={createCooldown}
        onDeleteChat={handleDeleteClick}
        onEditTitleClick={handleEditTitleClick}
        onExportClick={handleExportClick}
        isAuthenticated={isAuthenticated}
        isLoadingChats={isLoadingChats}
        hasLoadedChats={hasLoadedChats}
        chatSessions={chatSessions}
        currentChatId={useChatStore(state => state.currentChatId)}
      />

      {/* 主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部导航栏 */}
        <header className="h-14 bg-zinc-900 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-zinc-400 text-sm">主模型:</span>
            <div className="relative">
              <button
                onClick={() => setShowModelMenu(!showModelMenu)}
                disabled={isSwitchingModel || availableModels.length === 0}
                className={`flex items-center gap-2 px-3 py-1 bg-purple-600/20 text-purple-400 rounded-full text-sm font-medium border border-purple-500/30 hover:bg-purple-600/30 transition-colors ${
                  isSwitchingModel || availableModels.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                {isSwitchingModel ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>{getCurrentModelName()}</span>
                    <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* 模型选择下拉菜单 */}
              {showModelMenu && (
                <>
                  {/* 遮罩层 - 点击关闭菜单 */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowModelMenu(false)}
                  />
                  {/* 下拉菜单内容 */}
                  <div className="absolute left-0 top-full mt-1 w-56 bg-zinc-800 rounded-lg shadow-xl border border-zinc-700 z-50 max-h-80 overflow-y-auto">
                    {availableModels.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-zinc-400">
                        暂无可用模型
                      </div>
                    ) : (
                      availableModels.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => handleSwitchModel(model.id)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-zinc-700 transition-colors ${
                            currentModel === model.id ? 'text-purple-400 bg-purple-600/10' : 'text-zinc-300'
                          }`}
                        >
                          <span className="flex-1 text-left">{formatModelName(model.id)}</span>
                          {currentModel === model.id && (
                            <Check className="w-4 h-4 ml-2 flex-shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* 模型切换错误提示 Toast */}
              {modelSwitchError && (
                <div className="absolute left-0 top-full mt-2 w-max max-w-xs bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-60 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{modelSwitchError}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-zinc-400">在线</span>
          </div>
        </header>

        {/* 内容区域 */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* 未登录时显示遮罩层，阻止交互 */}
          {!isLoading && !isAuthenticated && (
            <div className="absolute inset-0 z-40 bg-zinc-900/80 backdrop-blur-sm flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-700 flex items-center justify-center">
                  <UserIcon className="w-10 h-10 text-zinc-500" />
                </div>
                <h2 className="text-xl font-semibold text-zinc-300 mb-2">请先登录</h2>
                <p className="text-zinc-500 mb-6">登录后即可开始与 AI 助手对话</p>
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-600/30"
                >
                  立即登录
                </button>
              </div>
            </div>
          )}

          {/* 加载状态 */}
          {isLoading && (
            <div className="absolute inset-0 z-40 bg-zinc-900 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-zinc-400">加载中...</p>
              </div>
            </div>
          )}

          {children}
        </div>
      </div>

      {/* 登录弹窗 */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={handleLoginSuccess}
      />

      {/* 用户信息弹窗 */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={user}
        onLogout={logout}
        onLogoutAndRefresh={handleLogoutAndRefresh}
        onUserUpdate={(newUser) => {
          // 更新 store 中的用户信息
          authStore.getState().setUser(newUser);
        }}
      />

      {/* 删除确认弹窗 */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        chatTitle={deletingChat?.title || ''}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteStatus === 'deleting'}
        deleteStatus={deleteStatus}
        errorMessage={deleteError}
      />

      {/* 编辑标题弹窗 */}
      <EditTitleModal
        isOpen={showEditTitleModal}
        onClose={handleCloseEditTitleModal}
        onConfirm={handleEditTitleConfirm}
        currentTitle={editingChat?.title || ''}
        maxLength={24}
      />
    </div>
  );
};

export default Layout;