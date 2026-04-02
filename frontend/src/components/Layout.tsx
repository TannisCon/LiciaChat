import React, { useState, useEffect, useCallback, useRef, Suspense, lazy, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  ChevronUp,
  Check,
  AlertCircle,
} from 'lucide-react';

// 懒加载 Modal 组件
const LoginModal = lazy(() => import('./LoginModal'));
const UserProfileModal = lazy(() => import('./UserProfileModal'));
const DeleteConfirmModal = lazy(() => import('./DeleteConfirmModal'));
const EditTitleModal = lazy(() => import('./EditTitleModal'));
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

// 按时间分组对话的工具函数
// 将 UTC 时间转换为本地时间后进行分组
const groupChatsByTime = (sessions: ChatSession[]) => {
  const now = new Date();
  // 获取本地日期的"今天零点"
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayTimestamp = today.getTime();
  
  const sevenDaysAgo = todayTimestamp - (7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = todayTimestamp - (30 * 24 * 60 * 60 * 1000);
  
  const last7Days: ChatSession[] = [];
  const last30Days: ChatSession[] = [];
  const earlier: ChatSession[] = [];
  
  sessions.forEach(session => {
    // 后端返回 UNIX 秒级时间戳（UTC），需要乘以 1000 转换为毫秒
    const sessionTimestamp = session.updated_at * 1000;
    
    if (sessionTimestamp >= sevenDaysAgo) {
      last7Days.push(session);
    } else if (sessionTimestamp >= thirtyDaysAgo) {
      last30Days.push(session);
    } else {
      earlier.push(session);
    }
  });
  
  return { last7Days, last30Days, earlier };
};

// 分组标签组件（不可互动的静态标签）
interface ChatGroupLabelProps {
  label: string;
  count: number;
}

const ChatGroupLabel: React.FC<ChatGroupLabelProps> = ({ label, count }) => {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-xs text-zinc-400 pointer-events-none">
      <span className="font-medium">{label}</span>
      {count > 0 && (
        <span className="px-2 py-0.5 bg-zinc-800 rounded-full text-xs text-zinc-400 font-medium">
          {count}
        </span>
      )}
    </div>
  );
};

// 分组对话列表组件
interface GroupedChatListProps {
  chatSessions: ChatSession[];
  currentChatId: string | null;
  onSelect: (chatId: string) => void;
  onDeleteClick: (chat: ChatSession) => void;
  onEditTitleClick: (chat: ChatSession) => void;
  onExportClick: (chat: ChatSession) => void;
}

const GroupedChatList: React.FC<GroupedChatListProps> = ({
  chatSessions,
  currentChatId,
  onSelect,
  onDeleteClick,
  onEditTitleClick,
  onExportClick,
}) => {
  // 使用 useMemo 缓存分组结果
  const { last7Days, last30Days, earlier } = useMemo(
    () => groupChatsByTime(chatSessions),
    [chatSessions]
  );

  return (
    <div className="space-y-2">
      {/* 最近 7 天 - 静态标签 */}
      {last7Days.length > 0 && (
        <div>
          <ChatGroupLabel label="最近 7 天" count={last7Days.length} />
          <div className="space-y-1">
            {last7Days.map((session) => (
              <ChatItem
                key={session.chat_id}
                session={session}
                isSelected={currentChatId === session.chat_id}
                onSelect={onSelect}
                onDeleteClick={onDeleteClick}
                onEditTitleClick={onEditTitleClick}
                onExportClick={onExportClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* 最近 30 天 - 静态标签 */}
      {last30Days.length > 0 && (
        <div>
          <ChatGroupLabel label="最近 30 天" count={last30Days.length} />
          <div className="space-y-1">
            {last30Days.map((session) => (
              <ChatItem
                key={session.chat_id}
                session={session}
                isSelected={currentChatId === session.chat_id}
                onSelect={onSelect}
                onDeleteClick={onDeleteClick}
                onEditTitleClick={onEditTitleClick}
                onExportClick={onExportClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* 更早对话 - 可折叠标签 */}
      {earlier.length > 0 && (
        <CollapsibleChatGroup
          label="更早对话"
          count={earlier.length}
          sessions={earlier}
          defaultExpanded={true}
          currentChatId={currentChatId}
          onSelect={onSelect}
          onDeleteClick={onDeleteClick}
          onEditTitleClick={onEditTitleClick}
          onExportClick={onExportClick}
        />
      )}
    </div>
  );
};

// 可折叠分组组件（用于"更早对话"）
interface CollapsibleChatGroupProps {
  label: string;
  count: number;
  sessions: ChatSession[];
  defaultExpanded?: boolean;
  currentChatId: string | null;
  onSelect: (chatId: string) => void;
  onDeleteClick: (chat: ChatSession) => void;
  onEditTitleClick: (chat: ChatSession) => void;
  onExportClick: (chat: ChatSession) => void;
}

const CollapsibleChatGroup: React.FC<CollapsibleChatGroupProps> = ({
  label,
  count,
  sessions,
  defaultExpanded = true,
  currentChatId,
  onSelect,
  onDeleteClick,
  onEditTitleClick,
  onExportClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  return (
    <div className="mb-2">
      {/* 分组标题 - 可点击折叠/展开 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800/50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronUp className="w-3 h-3" />
          )}
          <span className="font-medium">{label}</span>
        </div>
        {count > 0 && (
          <span className="px-2 py-0.5 bg-zinc-800 rounded-full text-xs">
            {count}
          </span>
        )}
      </button>
      
      {/* 对话列表 */}
      {isExpanded && (
        <div className="mt-1 space-y-1">
          {sessions.map((session) => (
            <ChatItem
              key={session.chat_id}
              session={session}
              isSelected={currentChatId === session.chat_id}
              onSelect={onSelect}
              onDeleteClick={onDeleteClick}
              onEditTitleClick={onEditTitleClick}
              onExportClick={onExportClick}
            />
          ))}
        </div>
      )}
    </div>
  );
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

// 下拉菜单内容组件（用于 Portal）
const ChatItemMenu: React.FC<{
  exportMenuOpen: boolean;
  onToggleExportMenu: () => void;
  onClose: () => void;
  onEditTitleClick: () => void;
  onExportClick: () => void;
  onDeleteClick: () => void;
  position: { top: number; left: number };
}> = ({ exportMenuOpen, onToggleExportMenu, onClose, onEditTitleClick, onExportClick, onDeleteClick, position }) => {
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [exportSubMenuPosition, setExportSubMenuPosition] = useState({ top: 0, left: 0 });

  // 计算导出子菜单位置
  useEffect(() => {
    if (exportMenuOpen && exportButtonRef.current) {
      const rect = exportButtonRef.current.getBoundingClientRect();
      setExportSubMenuPosition({
        top: rect.top,
        left: rect.right,
      });
    }
  }, [exportMenuOpen]);

  return (
    <>
      {/* 遮罩层 */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* 主菜单 */}
      <div
        className="fixed w-32 bg-zinc-700 rounded-lg shadow-xl border border-zinc-600 z-50"
        style={{ top: position.top, left: position.left }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            onEditTitleClick();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-zinc-600 rounded-t-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span>编辑标题</span>
        </button>
        {/* 导出对话选项 */}
        <div className="relative">
          <button
            ref={exportButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExportMenu();
            }}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-600 transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>导出</span>
            </span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {/* 导出子菜单 */}
          {exportMenuOpen && (
            <div
              className="fixed w-32 bg-zinc-700 rounded-r-lg shadow-xl border border-zinc-600 z-60 hover:bg-zinc-600 transition-colors rounded-r-lg"
              style={{ top: exportSubMenuPosition.top, left: exportSubMenuPosition.left }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                  onExportClick();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-600 rounded-lg transition-colors"
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
            onClose();
            onDeleteClick();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-600 rounded-b-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span>删除</span>
        </button>
      </div>
    </>
  );
};

const ChatItem: React.FC<ChatItemProps> = ({
  session,
  isSelected,
  onSelect,
  onDeleteClick,
  onEditTitleClick,
  onExportClick,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 客户端挂载
  useEffect(() => {
    // 使用 requestAnimationFrame 避免在 effect 中直接 setState
    requestAnimationFrame(() => {
      setMounted(true);
    });
  }, []);

  const handleOpenMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
    setExportMenuOpen(false);
    
    // 计算菜单位置
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  };

  const handleCloseMenu = useCallback(() => {
    setShowMenu(false);
    setExportMenuOpen(false);
  }, []);

  const handleToggleExportMenu = useCallback(() => {
    setExportMenuOpen((prev) => !prev);
  }, []);

  const menuContent = (
    <ChatItemMenu
      exportMenuOpen={exportMenuOpen}
      onToggleExportMenu={handleToggleExportMenu}
      onClose={handleCloseMenu}
      onEditTitleClick={() => onEditTitleClick(session)}
      onExportClick={() => onExportClick(session)}
      onDeleteClick={() => onDeleteClick(session)}
      position={menuPosition}
    />
  );

  return (
    <>
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
        <button
          ref={buttonRef}
          onClick={handleOpenMenu}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-600 rounded transition-all"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
      
      {/* 使用 Portal 渲染下拉菜单到 body，避免被父容器 overflow 裁剪 */}
      {showMenu && mounted && createPortal(menuContent, document.body)}
    </>
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
    <div className="w-72 bg-zinc-900 flex flex-col flex-shrink-0 transition-[width,transform] duration-300 h-[100dvh]" style={{ zIndex: 30 }}>
      {/* 顶部操作栏 */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <img src="/licia_32.png" alt="Licia Logo" className="w-8 h-8" />
              <span className="font-bold text-xl text-zinc-100">LiciaChat</span>
            </div>
            <span className="hidden lg:block text-sm text-blue-400/80 font-medium -mt-1 ml-10"> 心似双丝网，轻绾千千结</span>
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

      {/* 历史对话列表 - 按时间分组显示 */}
      <div className="flex-1 min-h-0 focus:outline-none overflow-y-auto p-2">
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
          <GroupedChatList
            chatSessions={chatSessions}
            currentChatId={currentChatId}
            onSelect={setCurrentChatId}
            onDeleteClick={onDeleteChat}
            onEditTitleClick={onEditTitleClick}
            onExportClick={onExportClick}
          />
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
      <div className="hidden lg:block p-4 text-xs text-zinc-500">
        <p>© 2026 LiciaChat</p>
        <p className="mt-1">Powered by Qwen</p>
      </div>
    </div>
  );
};

// 主布局组件
export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentModel, setChatSessions, setCurrentChatId, chatSessions, isLoadingChats, currentChatId, availableModels, setCurrentModel, chatTitle } = useChatStore();
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
  
  // 通用错误 Toast 状态
  const [toastError, setToastError] = useState<string | null>(null);

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
      // updated_at 是 UNIX 秒级时间戳，需要乘以 1000 转换为毫秒
      const sortedChats = chatListResponse.chats.sort((a, b) => 
        b.updated_at * 1000 - a.updated_at * 1000
      );
      setChatSessions(sortedChats);
      // 如果当前没有选中的对话，则自动选中新创建的对话
      if (!currentChatId) {
        setCurrentChatId(newChat.chat_id);
      }
    } catch (error) {
      console.error('创建对话失败:', error);
      setToastError('创建对话失败，请稍后重试');
      setTimeout(() => setToastError(null), 3000);
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
      // updated_at 是 UNIX 秒级时间戳，需要乘以 1000 转换为毫秒
      const sortedChats = chatListResponse.chats.sort((a, b) => 
        b.updated_at * 1000 - a.updated_at * 1000
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
          b.updated_at * 1000 - a.updated_at * 1000
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
      setToastError('导出对话失败，请稍后重试');
      setTimeout(() => setToastError(null), 3000);
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

  // 预加载 Modal 组件（用户登录后 1.5 秒统一预加载）
  useEffect(() => {
    if (isAuthenticated) {
      const timer = setTimeout(() => {
        import('./UserProfileModal').catch(console.error);
        import('./EditTitleModal').catch(console.error);
        import('./DeleteConfirmModal').catch(console.error);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  // 预加载 LoginModal（未登录时）
  useEffect(() => {
    if (!isAuthenticated) {
      import('./LoginModal').catch(console.error);
    }
  }, [isAuthenticated]);

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
        <header className="h-12 bg-zinc-900 flex items-center justify-between px-4 flex-shrink-0">
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
            </div>
            
            {/* 分隔符 */}
            {currentChatId && (
              <span className="text-zinc-600 mx-2">|</span>
            )}
            
            {/* 当前对话标题 */}
            {currentChatId && (
              <span className="text-zinc-300 text-sm font-medium truncate max-w-[240px]" >
                {chatTitle || ''}
              </span>
            )}
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

      {/* layout 通用错误提示 Toast - 固定定位到屏幕上方 1/3 处 */}
      {(modelSwitchError || toastError) && (
        <div className="fixed left-1/2 -translate-x-1/2 top-[33vh] bg-red-600 text-white px-6 py-3 rounded-lg shadow-xl text-sm z-[100] flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium">{modelSwitchError || toastError}</span>
        </div>
      )}

      {/* 懒加载 Modal - 条件渲染 + Suspense */}
      {showLoginModal && (
        <Suspense fallback={null}>
          <LoginModal
            isOpen={showLoginModal}
            onClose={() => setShowLoginModal(false)}
            onSuccess={handleLoginSuccess}
          />
        </Suspense>
      )}

      {showProfileModal && (
        <Suspense fallback={null}>
          <UserProfileModal
            isOpen={showProfileModal}
            onClose={() => setShowProfileModal(false)}
            user={user}
            onLogout={logout}
            onLogoutAndRefresh={handleLogoutAndRefresh}
            onUserUpdate={(newUser) => {
              authStore.getState().setUser(newUser);
            }}
          />
        </Suspense>
      )}

      {showDeleteModal && (
        <Suspense fallback={null}>
          <DeleteConfirmModal
            isOpen={showDeleteModal}
            chatTitle={deletingChat?.title || ''}
            onClose={handleCloseDeleteModal}
            onConfirm={handleDeleteConfirm}
            isDeleting={deleteStatus === 'deleting'}
            deleteStatus={deleteStatus}
            errorMessage={deleteError}
          />
        </Suspense>
      )}

      {showEditTitleModal && (
        <Suspense fallback={null}>
          <EditTitleModal
            isOpen={showEditTitleModal}
            onClose={handleCloseEditTitleModal}
            onConfirm={handleEditTitleConfirm}
            currentTitle={editingChat?.title || ''}
            maxLength={24}
          />
        </Suspense>
      )}
    </div>
  );
};

export default Layout;