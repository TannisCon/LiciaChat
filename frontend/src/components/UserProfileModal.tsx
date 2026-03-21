import React, { useState, useEffect, useRef } from 'react';
import { X, User, Mail, Hash, Calendar, LogOut, Edit, Check, XCircle, Loader2, Key, Users, Database, Link, ShieldCheck, AlertTriangle, Shield } from 'lucide-react';
import type { UserInfo } from '../store/authStore';
import { updateUsername, getCurrentUser, getApiKeyInfo, updateApiKey, type ApiKeyInfo } from '../services/authApi';
import ChangePasswordModal from './ChangePasswordModal';

// 邀请码模块类型定义（用于动态导入）
type InviteModalType = React.FC<{ isOpen: boolean; onClose: () => void; userRole: string }> & {
  (props: { isOpen: boolean; onClose: () => void; userRole: string }): React.ReactElement;
};

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserInfo | null;
  onLogout: () => void;
  onLogoutAndRefresh: () => void;
  onUserUpdate?: (newUser: UserInfo) => void;
}

type EditStatus = 'idle' | 'loading' | 'success' | 'error';
type TabType = 'profile' | 'apikey';
type ApiKeyStatus = 'idle' | 'loading' | 'success' | 'error';
type ApiKeyEditMode = 'idle' | 'editing' | 'confirming' | 'submitting' | 'success';
type ConfirmActionType = 'update' | 'clear' | null;

// API Key 状态显示配置
const apiKeyStatusConfig: Record<string, { 
  label: string; 
  colorClass: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  valid: { label: '有效 (Valid)', colorClass: 'text-green-400', icon: ShieldCheck },
  invalid: { label: '无效 (Invalid)', colorClass: 'text-red-400', icon: XCircle },
  pending: { label: '未验证 (Pending)', colorClass: 'text-yellow-400', icon: Loader2 },
  quota: { label: '配额不足 (Quota)', colorClass: 'text-yellow-400', icon: AlertTriangle },
};

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onLogoutAndRefresh,
  onUserUpdate,
}) => {
  // 邀请管理弹窗状态
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  // 动态加载的 InviteModal 组件
  const [InviteModalComponent, setInviteModalComponent] = useState<InviteModalType | null>(null);
  // 模块加载状态
  const [isModuleLoading, setIsModuleLoading] = useState(false);
  const [moduleLoadError, setModuleLoadError] = useState<string | null>(null);
  
  // 修改密码弹窗状态
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  
  // 编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [editStatus, setEditStatus] = useState<EditStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  // 标签页状态
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  
  // API Key 信息状态
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>('idle');
  const [apiKeyError, setApiKeyError] = useState<string>('');
  
  // API Key 编辑状态
  const [apiKeyEditMode, setApiKeyEditMode] = useState<ApiKeyEditMode>('idle');
  const [apiKeyEditValue, setApiKeyEditValue] = useState({
    apiKey: '',
    provider: 'bailian' as 'bailian' | 'vllm',
    baseUrl: '',
  });
  
  // 二次确认弹窗状态
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionType>(null);
  const [confirmStatus, setConfirmStatus] = useState<'waiting' | 'submitting' | 'success' | 'error'>('waiting');
  const [confirmError, setConfirmError] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(0);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const apiKeyAbortControllerRef = useRef<AbortController | null>(null);

  // 当用户变化时重置编辑状态
  useEffect(() => {
    if (user) {
      setEditValue(user.username);
      setOriginalUsername(user.username);
    }
  }, [user]);

  // 当 modal 打开时，聚焦到输入框
  useEffect(() => {
    if (isEditing && inputRef.current && isOpen) {
      inputRef.current.focus();
    }
  }, [isEditing, isOpen]);

  // 清理函数：当组件卸载或 modal 关闭时清理所有状态
  useEffect(() => {
    if (!isOpen) {
      // 取消未完成的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (apiKeyAbortControllerRef.current) {
        apiKeyAbortControllerRef.current.abort();
        apiKeyAbortControllerRef.current = null;
      }
      // 重置所有状态
      setIsEditing(false);
      setEditStatus('idle');
      setErrorMessage('');
      setEditValue('');
      // 重置标签页为用户信息标签页
      setActiveTab('profile');
      // 重置 API Key 编辑状态
      setApiKeyEditMode('idle');
      setShowConfirmModal(false);
      setConfirmAction(null);
      setConfirmStatus('waiting');
      setConfirmError('');
      setCountdown(0);
    }
  }, [isOpen]);

  // 当标签页切换时，如果是 API Key 标签页则获取数据
  useEffect(() => {
    if (activeTab === 'apikey' && isOpen) {
      fetchApiKeyInfo();
    }
  }, [activeTab, isOpen]);

  // 倒计时处理
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 获取 API Key 信息
  const fetchApiKeyInfo = async () => {
    setApiKeyStatus('loading');
    setApiKeyError('');
    setApiKeyInfo(null);
    
    try {
      const info = await getApiKeyInfo();
      setApiKeyInfo(info);
      setApiKeyStatus('success');
    } catch (error) {
      setApiKeyStatus('error');
      setApiKeyError(error instanceof Error ? error.message : '获取 API Key 信息失败');
    }
  };

  // 阻止关闭的处理器
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (editStatus === 'loading' || confirmStatus === 'submitting') {
      e.stopPropagation();
      return;
    }
    onClose();
  };

  const handleClose = () => {
    if (editStatus === 'loading' || confirmStatus === 'submitting') {
      return;
    }
    onClose();
  };

  // 打开邀请管理弹窗 - 先二次鉴权，通过后再加载模块
  const handleOpenInviteModal = async () => {
    if (editStatus === 'loading' || confirmStatus === 'submitting') {
      return;
    }
    
    // 如果模块已加载，直接打开弹窗
    if (InviteModalComponent) {
      setIsInviteModalOpen(true);
      return;
    }
    
    // 模块未加载时，先执行二次鉴权
    if (!isModuleLoading) {
      setIsModuleLoading(true);
      setModuleLoadError(null);
      
      try {
        // 第一步：二次鉴权 - 使用 authApi 获取当前用户信息（不导入 inviteApi）
        const userInfo = await getCurrentUser();
        
        // 验证角色是否为 admin 或 trusted
        if (userInfo.role !== 'admin' && userInfo.role !== 'trusted') {
          setModuleLoadError('权限不足：仅管理员和授信用户可以访问');
          setIsModuleLoading(false);
          return;
        }
        
        // 第二步：鉴权通过，动态导入邀请码模块并保存用户角色
        const module = await import('./InviteModal');
        const InviteModal = module.InviteModal || module.default;
        // 保存用户角色，供 InviteModal 使用
        setInviteModalComponent(() => {
          const WrappedInviteModal = (props: { isOpen: boolean; onClose: () => void }) => (
            <InviteModal {...props} userRole={userInfo.role} />
          );
          return WrappedInviteModal;
        });
        setIsInviteModalOpen(true);
      } catch (error) {
        console.error('权限验证或模块加载失败:', error);
        setModuleLoadError(error instanceof Error ? error.message : '权限验证失败');
      } finally {
        setIsModuleLoading(false);
      }
    }
  };

  // 打开修改密码弹窗
  const handleOpenChangePassword = () => {
    if (editStatus === 'loading' || confirmStatus === 'submitting') {
      return;
    }
    setIsChangePasswordOpen(true);
  };

  // 修改密码成功回调
  const handleChangePasswordSuccess = () => {
    // 密码修改成功，token 已在 ChangePasswordModal 中更新
  };

  // 开始编辑
  const handleStartEdit = () => {
    if (user) {
      setEditValue(user.username);
      setOriginalUsername(user.username);
      setIsEditing(true);
      setEditStatus('idle');
      setErrorMessage('');
    }
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue(originalUsername);
    setEditStatus('idle');
    setErrorMessage('');
  };

  // 确认编辑
  const handleConfirmEdit = async () => {
    const trimmedValue = editValue.trim();
    
    // 验证输入
    if (!trimmedValue) {
      setEditStatus('error');
      setErrorMessage('用户名不能为空');
      return;
    }
    
    if (trimmedValue === originalUsername) {
      // 没有变化，直接退出编辑模式
      handleCancelEdit();
      return;
    }

    if (trimmedValue.length > 16) {
      setEditStatus('error');
      setErrorMessage('用户名不能超过 16 个字符');
      return;
    }

    // 开始提交
    setEditStatus('loading');
    setErrorMessage('');

    // 创建新的 AbortController 用于此请求
    abortControllerRef.current = new AbortController();

    try {
      const response = await updateUsername(trimmedValue, abortControllerRef.current.signal);
      
      setEditStatus('success');
      
      // 更新用户信息
      if (onUserUpdate) {
        onUserUpdate({
          uid: response.uid,
          uuid: response.uuid,
          email: response.email,
          username: response.username,
          role: response.role,
          created_at: response.created_at,
        });
      }
      
      // 延迟退出编辑模式，让用户看到成功状态
      setTimeout(() => {
        setIsEditing(false);
        setEditStatus('idle');
        setOriginalUsername(response.username);
      }, 1500);
      
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setEditStatus('error');
        setErrorMessage(error.message || '更新失败');
        
        // 3 秒后退出编辑状态
        setTimeout(() => {
          setIsEditing(false);
          setEditStatus('idle');
          setErrorMessage('');
        }, 3000);
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  // 处理 Enter 键
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editStatus === 'loading') {
        return;
      }
      handleConfirmEdit();
    }
  };

  // 切换标签页
  const handleTabChange = (tab: TabType) => {
    if (editStatus === 'loading' || confirmStatus === 'submitting') {
      return;
    }
    // 切换标签页时退出编辑状态
    if (isEditing) {
      handleCancelEdit();
    }
    if (apiKeyEditMode === 'editing') {
      setApiKeyEditMode('idle');
      setApiKeyEditValue({
        apiKey: '',
        provider: 'bailian',
        baseUrl: '',
      });
    }
    setActiveTab(tab);
  };

  // 开始编辑 API Key
  const handleStartApiKeyEdit = () => {
    setApiKeyEditMode('editing');
    setApiKeyEditValue({
      apiKey: '',
      provider: 'bailian',
      baseUrl: '',
    });
  };

  // 取消编辑 API Key
  const handleCancelApiKeyEdit = () => {
    setApiKeyEditMode('idle');
    setApiKeyEditValue({
      apiKey: '',
      provider: 'bailian',
      baseUrl: '',
    });
  };

  // 检查 Base URL 是否有有效的 http://或 https://前缀
  const isValidBaseUrl = (url: string) => {
    const trimmedUrl = url.trim();
    return trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://');
  };

  // 检查 API Key 表单是否有效
  const isApiKeyFormValid = () => {
    return (
      apiKeyEditValue.apiKey.trim() !== '' &&
      apiKeyEditValue.baseUrl.trim() !== '' &&
      isValidBaseUrl(apiKeyEditValue.baseUrl)
    );
  };

  // 确认修改 API Key - 显示二次确认弹窗
  const handleConfirmApiKeyEdit = () => {
    setConfirmAction('update');
    setShowConfirmModal(true);
    setConfirmStatus('waiting');
    setConfirmError('');
    setCountdown(0);
  };

  // 清除 API Key - 显示二次确认弹窗
  const handleClearApiKey = () => {
    setConfirmAction('clear');
    setShowConfirmModal(true);
    setConfirmStatus('waiting');
    setConfirmError('');
    setCountdown(0);
  };

  // 提交 API Key 修改
  const handleSubmitApiKey = async () => {
    setConfirmStatus('submitting');
    setCountdown(15);
    setConfirmError('');
    
    apiKeyAbortControllerRef.current = new AbortController();
    
    try {
      const response = await updateApiKey(
        'update',
        apiKeyEditValue.apiKey,
        apiKeyEditValue.provider,
        apiKeyEditValue.baseUrl,
        apiKeyAbortControllerRef.current.signal,
        15000
      );
      
      setConfirmStatus('success');
      setApiKeyInfo({
        api_key_masked: response.api_key_masked,
        status: response.status as 'valid' | 'quota' | 'invalid' | 'pending',
        provider: response.provider as 'bailian' | 'vllm',
        base_url: response.base_url,
        updated_at: response.updated_at,
      });
      setCountdown(0);
      
      // 1 秒后关闭二次确认弹窗
      setTimeout(() => {
        setShowConfirmModal(false);
        setApiKeyEditMode('idle');
        setConfirmAction(null);
        setConfirmStatus('waiting');
      }, 1000);
      
    } catch (error) {
      setConfirmStatus('error');
      setConfirmError(error instanceof Error ? error.message : '提交失败');
      setCountdown(0);
    } finally {
      apiKeyAbortControllerRef.current = null;
    }
  };

  // 提交清除 API Key
  const handleSubmitClearApiKey = async () => {
    setConfirmStatus('submitting');
    setCountdown(15);
    setConfirmError('');
    
    apiKeyAbortControllerRef.current = new AbortController();
    
    try {
      const response = await updateApiKey(
        'clear',
        undefined,
        undefined,
        undefined,
        apiKeyAbortControllerRef.current.signal,
        15000
      );
      
      setConfirmStatus('success');
      setApiKeyInfo({
        api_key_masked: response.api_key_masked,
        status: response.status as 'valid' | 'quota' | 'invalid' | 'pending',
        provider: response.provider as 'bailian' | 'vllm',
        base_url: response.base_url,
        updated_at: response.updated_at,
      });
      setCountdown(0);
      
      // 1 秒后关闭二次确认弹窗
      setTimeout(() => {
        setShowConfirmModal(false);
        setApiKeyEditMode('idle');
        setConfirmAction(null);
        setConfirmStatus('waiting');
      }, 1000);
      
    } catch (error) {
      setConfirmStatus('error');
      setConfirmError(error instanceof Error ? error.message : '清除失败');
      setCountdown(0);
    } finally {
      apiKeyAbortControllerRef.current = null;
    }
  };

  // 取消二次确认
  const handleCancelConfirm = () => {
    setShowConfirmModal(false);
    setConfirmAction(null);
    setConfirmStatus('waiting');
    setConfirmError('');
    setCountdown(0);
    // 退出 API Key 编辑状态
    setApiKeyEditMode('idle');
    setApiKeyEditValue({
      apiKey: '',
      provider: 'bailian',
      baseUrl: '',
    });
  };

  if (!isOpen || !user) return null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    // 使用浏览器当前语言自动切换
    const locale = navigator.language || 'zh-CN';
    return date.toLocaleString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 渲染 API Key 状态
  const renderApiKeyStatus = (status: string) => {
    const config = apiKeyStatusConfig[status];
    if (!config) {
      return <span className="text-zinc-400">未知状态</span>;
    }
    const Icon = config.icon;
    return (
      <div className={`flex items-center gap-2 ${config.colorClass}`}>
        <Icon className="w-5 h-5" />
        <span>{config.label}</span>
      </div>
    );
  };

  // 判断是否为管理员
  const isAdmin = user.role === 'admin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${editStatus === 'loading' || confirmStatus === 'submitting' ? 'pointer-events-auto' : ''}`}
        onClick={handleBackdropClick}
      />

      {/* 用户信息窗口 - 固定高度 */}
      <div className={`relative bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 border border-zinc-700 overflow-hidden ${editStatus === 'loading' || confirmStatus === 'submitting' ? 'pointer-events-auto' : ''}`}>
        {/* 关闭按钮 - 加载时禁用 */}
        <button
          onClick={handleClose}
          disabled={editStatus === 'loading' || confirmStatus === 'submitting'}
          className={`absolute top-4 right-4 z-10 p-2 bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-full transition-colors backdrop-blur-sm ${editStatus === 'loading' || confirmStatus === 'submitting' ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <X className="w-5 h-5" />
        </button>

        {/* 窗口内容 - 左右布局，固定高度 */}
        <div className="flex h-[600px] max-h-[80vh]">
          {/* 左侧边栏 */}
          <div className="w-56 bg-zinc-900/50 border-r border-zinc-700 p-6 flex flex-col">
            {/* 用户头像和用户名展示块 */}
            <div className="mb-6">
              {/* 头像 */}
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center border-4 border-zinc-800 shadow-xl mb-3">
                <User className="w-10 h-10 text-white" />
              </div>
              
              {/* 用户名 */}
              <div className="text-center">
                <h3 className="text-base font-medium text-zinc-100 truncate">{user.username}</h3>
                {/* UID 和用户组 */}
                <div className="flex items-center justify-center gap-2 mt-2 text-xs text-zinc-500">
                  <span>UID: {user.uid}</span>
                  <span>•</span>
                  <span>
                    {user.role === 'admin' ? '管理员' : '用户'}
                  </span>
                </div>
              </div>
            </div>

            {/* 垂直导航栏 */}
            <nav className="flex-1 space-y-1">
              <button
                onClick={() => handleTabChange('profile')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                  activeTab === 'profile'
                    ? 'bg-purple-600/20 text-purple-400 border border-purple-600/30'
                    : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200'
                }`}
              >
                <User className="w-4 h-4" />
                <span className="text-sm font-medium">用户信息</span>
              </button>
              
              <button
                onClick={() => handleTabChange('apikey')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                  activeTab === 'apikey'
                    ? 'bg-purple-600/20 text-purple-400 border border-purple-600/30'
                    : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200'
                }`}
              >
                <Key className="w-4 h-4" />
                <span className="text-sm font-medium">API KEY 管理</span>
              </button>
            </nav>
          </div>

          {/* 右侧内容区 - 使用 flex 列布局 */}
          <div className="flex-1 flex flex-col p-0">
            {/* 可滚动内容区 */}
            <div className="flex-1 overflow-y-auto p-8">
              {/* 用户信息标签页 */}
              {activeTab === 'profile' && (
                <div className="space-y-3">
                  {/* 用户名编辑区域 */}
                  <div className="flex items-center gap-3 bg-zinc-700/50 rounded-lg p-3">
                    <div className="w-10 h-10 rounded-lg bg-zinc-600/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 mb-1">用户名</p>
                      {isEditing ? (
                        // 编辑模式
                        <div className="flex items-center gap-2">
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => {
                              setEditValue(e.target.value);
                              if (editStatus === 'error') {
                                setEditStatus('idle');
                                setErrorMessage('');
                              }
                            }}
                            onKeyDown={handleKeyDown}
                            disabled={editStatus === 'loading'}
                            maxLength={16}
                            className={`flex-1 bg-zinc-700 border-2 rounded-lg px-3 py-1 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${editStatus === 'error' ? 'border-red-500' : 'border-zinc-600'} ${editStatus === 'loading' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          />
                          {/* 编辑操作按钮 */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={handleConfirmEdit}
                              disabled={editStatus !== 'idle'}
                              className={`p-1.5 text-green-400 hover:bg-green-600/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${editStatus !== 'idle' ? 'hover:bg-transparent' : ''}`}
                              title="确认"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={editStatus === 'loading'}
                              className={`p-1.5 text-yellow-400 hover:bg-yellow-600/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                              title="撤销"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        // 查看模式
                        <div className="flex items-center gap-2">
                          <p className="text-zinc-200 text-sm">{user.username}</p>
                          <button
                            onClick={handleStartEdit}
                            disabled={editStatus === 'loading'}
                            className="p-1 text-zinc-400 hover:bg-zinc-600/50 hover:text-zinc-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="编辑用户名"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      
                      {/* 状态显示 */}
                      {isEditing && editStatus !== 'idle' && (
                        <div className={`mt-1.5 px-2 py-1 rounded text-xs flex items-center gap-1.5 w-fit ${
                          editStatus === 'loading' ? 'bg-blue-600/20 text-blue-400' :
                          editStatus === 'success' ? 'bg-green-600/20 text-green-400' :
                          'bg-red-600/20 text-red-400'
                        }`}>
                          {editStatus === 'loading' && <Loader2 className="w-3 h-3 animate-spin" />}
                          {editStatus === 'success' && <Check className="w-3 h-3" />}
                          {editStatus === 'error' && <XCircle className="w-3 h-3" />}
                          <span>
                            {editStatus === 'loading' && '正在编辑...'}
                            {editStatus === 'success' && '编辑成功'}
                            {editStatus === 'error' && errorMessage}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 头像 */}
                  <div className="flex items-center gap-3 bg-zinc-700/50 rounded-lg p-3">
                    <div className="w-10 h-10 rounded-lg bg-pink-600/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-pink-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 mb-0.5">头像</p>
                      <button
                        disabled
                        className="flex items-center gap-1 px-2 py-0.5 bg-zinc-600/30 text-zinc-500 rounded-lg text-sm"
                      >
                        <span>修改头像</span>
                      </button>
                    </div>
                  </div>

                  {/* 邮箱 */}
                  <div className="flex items-center gap-3 bg-zinc-700/50 rounded-lg p-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 mb-0.5">邮箱</p>
                      <p className="text-zinc-200 text-sm truncate">{user.email}</p>
                    </div>
                  </div>

                  {/* UUID */}
                  <div className="flex items-center gap-3 bg-zinc-700/50 rounded-lg p-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center flex-shrink-0">
                      <Hash className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 mb-0.5">UUID</p>
                      <p className="text-zinc-200 text-sm font-mono truncate">{user.uuid}</p>
                    </div>
                  </div>

                  {/* 注册时间 */}
                  <div className="flex items-center gap-3 bg-zinc-700/50 rounded-lg p-3">
                    <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 mb-0.5">注册时间</p>
                      <p className="text-zinc-200 text-sm">{formatDate(user.created_at)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* API KEY 管理标签页 */}
              {activeTab === 'apikey' && (
                <div className="space-y-3">
                  {apiKeyStatus === 'loading' && (
                    <div className="flex flex-col items-center justify-center py-8">
                      <Loader2 className="w-8 h-8 animate-spin text-purple-400 mb-3" />
                      <p className="text-zinc-400 text-sm">正在加载 API Key 信息...</p>
                    </div>
                  )}
                  
                  {apiKeyStatus === 'error' && (
                    <div className="flex flex-col items-center justify-center py-8">
                      <XCircle className="w-10 h-10 text-red-400 mb-3" />
                      <p className="text-zinc-300 mb-3 text-sm">{apiKeyError}</p>
                      <button
                        onClick={fetchApiKeyInfo}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors text-sm"
                      >
                        重新加载
                      </button>
                    </div>
                  )}
                  
                  {apiKeyStatus === 'success' && apiKeyInfo && (
                    <div className="space-y-3">
                      {/* API KEY */}
                      <div className="flex items-center gap-3 bg-zinc-700/50 rounded-lg p-3">
                        <div className="w-10 h-10 rounded-lg bg-yellow-600/20 flex items-center justify-center flex-shrink-0">
                          <Key className="w-5 h-5 text-yellow-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-500 mb-0.5">API KEY</p>
                          {apiKeyEditMode === 'editing' ? (
                            <input
                              type="text"
                              value={apiKeyEditValue.apiKey}
                              onChange={(e) => setApiKeyEditValue({ ...apiKeyEditValue, apiKey: e.target.value })}
                              placeholder="请输入新的 API Key"
                              maxLength={255}
                              className="w-full bg-zinc-700 border-2 border-zinc-600 rounded-lg px-3 py-1 text-zinc-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          ) : (
                            <p className="text-zinc-200 text-sm font-mono">
                              {apiKeyInfo.api_key_masked || '未能获取到数据'}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 提供商 */}
                      <div className="flex items-center gap-3 bg-zinc-700/50 rounded-lg p-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                          <Database className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-500 mb-0.5">提供商</p>
                          {apiKeyEditMode === 'editing' ? (
                            <select
                              value={apiKeyEditValue.provider}
                              onChange={(e) => setApiKeyEditValue({ ...apiKeyEditValue, provider: e.target.value as 'bailian' | 'vllm' })}
                              className="w-full bg-zinc-700 border-2 border-zinc-600 rounded-lg px-3 py-1 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            >
                              <option value="bailian">阿里云百炼</option>
                              <option value="vllm" disabled>vLLM (暂不可用)</option>
                            </select>
                          ) : (
                            <p className="text-zinc-200 text-sm capitalize">
                              {apiKeyInfo.provider === 'bailian' ? '阿里云百炼' : apiKeyInfo.provider === 'vllm' ? 'vLLM' : apiKeyInfo.provider}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* BASE URL */}
                      <div className="flex items-center gap-3 bg-zinc-700/50 rounded-lg p-3">
                        <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center flex-shrink-0">
                          <Link className="w-5 h-5 text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-500 mb-0.5">BASE URL</p>
                          {apiKeyEditMode === 'editing' ? (
                            <div>
                              <input
                                type="text"
                                value={apiKeyEditValue.baseUrl}
                                onChange={(e) => setApiKeyEditValue({ ...apiKeyEditValue, baseUrl: e.target.value })}
                                placeholder="请输入 Base URL（需包含 http://或 https://）"
                                maxLength={255}
                                className={`w-full bg-zinc-700 border-2 rounded-lg px-3 py-1 text-zinc-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                                  apiKeyEditValue.baseUrl.trim() !== '' && !isValidBaseUrl(apiKeyEditValue.baseUrl)
                                    ? 'border-red-500'
                                    : 'border-zinc-600'
                                }`}
                              />
                              {apiKeyEditValue.baseUrl.trim() !== '' && !isValidBaseUrl(apiKeyEditValue.baseUrl) && (
                                <p className="text-xs text-red-400 mt-1">
                                  Base URL 必须是合法的Url
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-zinc-200 text-sm font-mono truncate">
                              {apiKeyInfo.base_url}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 状态 */}
                      <div className="flex items-center gap-3 bg-zinc-700/50 rounded-lg p-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center flex-shrink-0">
                          <Shield className="w-5 h-5 text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-500 mb-0.5">状态</p>
                          <p className="text-zinc-200 text-sm">
                            {renderApiKeyStatus(apiKeyInfo.status)}
                          </p>
                        </div>
                      </div>

                      {/* 更新时间 */}
                      {apiKeyInfo.updated_at && (
                        <div className="flex items-center gap-3 bg-zinc-700/50 rounded-lg p-3">
                          <div className="w-10 h-10 rounded-lg bg-zinc-600/20 flex items-center justify-center flex-shrink-0">
                            <Calendar className="w-5 h-5 text-zinc-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-zinc-500 mb-0.5">最后更新</p>
                            <p className="text-zinc-200 text-sm">
                              {formatDate(apiKeyInfo.updated_at)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 固定在底部的操作按钮区 */}
            {activeTab === 'profile' && (
              <div className="border-t border-zinc-700 p-6 bg-zinc-800">
                <div className="space-y-3">
                  {/* 邀请用户按钮（仅 admin/trusted 显示） */}
                  {(user?.role === 'admin' || user?.role === 'trusted') && (
                    <button
                      onClick={handleOpenInviteModal}
                      disabled={editStatus === 'loading' || confirmStatus === 'submitting'}
                      className={`w-full flex items-center justify-center gap-2 p-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-600/30 rounded-lg transition-colors ${editStatus === 'loading' || confirmStatus === 'submitting' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Users className="w-4 h-4" />
                      <span className="text-sm font-medium">邀请用户</span>
                    </button>
                  )}
                  
                  {/* 修改密码和退出登录按钮 */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleOpenChangePassword}
                      disabled={editStatus === 'loading' || confirmStatus === 'submitting'}
                      className={`flex-1 flex items-center justify-center gap-2 p-2.5 bg-zinc-700/50 hover:bg-zinc-600/50 text-zinc-300 border border-zinc-600 rounded-lg transition-colors ${editStatus === 'loading' || confirmStatus === 'submitting' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Key className="w-4 h-4" />
                      <span className="text-sm font-medium">修改密码</span>
                    </button>
                    
                    <button
                      onClick={() => onLogoutAndRefresh()}
                      disabled={editStatus === 'loading' || confirmStatus === 'submitting'}
                      className={`flex-1 flex items-center justify-center gap-2 p-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg transition-colors ${editStatus === 'loading' || confirmStatus === 'submitting' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="text-sm font-medium">退出登录</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* API Key 管理标签页的底部按钮区 */}
            {activeTab === 'apikey' && (
              <div className="border-t border-zinc-700 p-6 bg-zinc-800">
                {/* 管理员提示信息栏 */}
                {isAdmin && (
                  <div className="mb-3 p-3 bg-yellow-600/20 border border-yellow-600/30 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-yellow-400 text-sm">
                      管理员 API KEY 由服务器配置文件配置，无法在线修改
                    </p>
                  </div>
                )}
                
                <div className="flex gap-3">
                  <button
                    onClick={apiKeyEditMode === 'editing' ? handleConfirmApiKeyEdit : handleStartApiKeyEdit}
                    disabled={editStatus === 'loading' || confirmStatus === 'submitting' || isAdmin || (apiKeyEditMode === 'editing' && !isApiKeyFormValid())}
                    className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      apiKeyEditMode === 'editing' && !isApiKeyFormValid()
                        ? 'bg-zinc-600 text-zinc-400'
                        : editStatus === 'loading' || confirmStatus === 'submitting' || isAdmin
                          ? 'opacity-50 cursor-not-allowed bg-purple-600/20 text-purple-400 border border-purple-600/30'
                          : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-600/30'
                    }`}
                  >
                    {apiKeyEditMode === 'editing' ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span className="text-sm font-medium">确认修改</span>
                      </>
                    ) : (
                      <>
                        <Edit className="w-4 h-4" />
                        <span className="text-sm font-medium">修改 API KEY</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={apiKeyEditMode === 'editing' ? handleCancelApiKeyEdit : handleClearApiKey}
                    disabled={editStatus === 'loading' || confirmStatus === 'submitting' || isAdmin}
                    className={`flex-1 flex items-center justify-center gap-2 p-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${editStatus === 'loading' || confirmStatus === 'submitting' || isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <XCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {apiKeyEditMode === 'editing' ? '撤销' : '清除 API KEY'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 修改密码弹窗 */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        onSuccess={handleChangePasswordSuccess}
      />

      {/* API Key 二次确认弹窗 */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          {/* 背景遮罩 */}
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${confirmStatus === 'submitting' ? 'pointer-events-auto' : ''}`}
            onClick={() => {
              if (confirmStatus !== 'submitting') {
                handleCancelConfirm();
              }
            }}
          />
          
          {/* 弹窗内容 */}
          <div className={`relative bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-zinc-700 overflow-hidden ${confirmStatus === 'submitting' ? 'pointer-events-auto' : ''}`}>
            {/* 顶部装饰条 */}
            <div className="h-2 bg-gradient-to-r from-purple-600 to-purple-600" />

            {/* 关闭按钮 */}
            <button
              onClick={handleCancelConfirm}
              disabled={confirmStatus === 'submitting'}
              className={`absolute top-4 right-4 z-10 p-2 bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-full transition-colors backdrop-blur-sm ${confirmStatus === 'submitting' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <X className="w-5 h-5" />
            </button>

            {/* 窗口内容 */}
            <div className="px-8 pb-8 pt-6">
              {/* 标题 */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-100">
                    {confirmAction === 'update' ? '修改 API Key' : '清除 API Key'}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {confirmAction === 'update' ? '请仔细阅读以下提示' : '此操作不可逆，请谨慎操作'}
                  </p>
                </div>
              </div>

              {/* 安全提示 */}
              <div className="mb-6 p-4 bg-red-600/10 border border-red-500/30 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    {confirmAction === 'update' && (
                      <>
                        <p className="text-sm text-red-300 font-medium">修改 API Key 提示</p>
                        <p className="text-xs text-red-400/70 mt-1">
                          修改 API Key 将对您提供的 API Key 进行检查以确保有效，这个过程将会少量消耗您的 API 配额。
                          修改成功后原 API Key 将被覆盖，无法恢复。
                        </p>
                      </>
                    )}
                    {confirmAction === 'clear' && (
                      <>
                        <p className="text-sm text-red-300 font-medium">清除 API Key 提示</p>
                        <p className="text-xs text-red-400/70 mt-1">
                          清除 API Key 将删除服务器中存储的您的 API Key，清除成功后您的 API Key 将无法恢复，对话功能将无法使用。
                          您仍然可以浏览和导出现有对话，若您仍希望使用对话功能，请重新配置您的 API Key。
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* 状态显示区域 */}
              {confirmStatus === 'waiting' && (
                <div className="flex gap-3">
                  <button
                    onClick={handleCancelConfirm}
                    className="flex-1 px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors font-medium"
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmAction === 'update' ? handleSubmitApiKey : handleSubmitClearApiKey}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-medium"
                  >
                    确定
                  </button>
                </div>
              )}
              
              {confirmStatus === 'submitting' && (
                <div className="py-4">
                  <div className="flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-400 mb-3" />
                    <p className="text-zinc-300 text-sm">
                      正在提交... ({countdown}s)
                    </p>
                  </div>
                </div>
              )}
              
              {confirmStatus === 'success' && (
                <div className="py-4">
                  <div className="flex flex-col items-center justify-center">
                    <Check className="w-8 h-8 text-green-400 mb-3" />
                    <p className="text-green-400 text-sm">
                      {confirmAction === 'update' ? '修改成功' : '清除成功'}
                    </p>
                  </div>
                </div>
              )}
              
              {confirmStatus === 'error' && (
                <div className="py-4">
                  <div className="flex flex-col items-center justify-center">
                    <XCircle className="w-8 h-8 text-red-400 mb-3" />
                    <p className="text-red-400 text-sm mb-4">{confirmError}</p>
                    <button
                      onClick={handleCancelConfirm}
                      className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors text-sm"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 邀请管理弹窗 - 动态加载后渲染 */}
      {isInviteModalOpen && (
        <>
          {/* 模块加载中 */}
          {isModuleLoading && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-zinc-800 rounded-2xl p-8 flex items-center gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                <p className="text-zinc-300">正在加载...</p>
              </div>
            </div>
          )}
          
          {/* 模块加载失败 */}
          {moduleLoadError && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-zinc-800 rounded-2xl p-8 flex items-center gap-4 flex-col">
                <XCircle className="w-12 h-12 text-red-400" />
                <p className="text-zinc-300">{moduleLoadError}</p>
                <button
                  onClick={() => {
                    setModuleLoadError(null);
                    setIsInviteModalOpen(false);
                  }}
                  className="mt-4 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          )}
          
          {/* 模块加载成功，渲染 InviteModal */}
          {InviteModalComponent && !isModuleLoading && !moduleLoadError && (
            <InviteModalComponent
              isOpen={isInviteModalOpen}
              onClose={() => setIsInviteModalOpen(false)}
              userRole={user.role}
            />
          )}
        </>
      )}
    </div>
  );
};

export default UserProfileModal;