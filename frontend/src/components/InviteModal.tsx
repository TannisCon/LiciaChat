import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Users,
  Settings,
} from 'lucide-react';
import {
  createInviteCode,
  getInviteCodes,
  deleteInviteCode,
  type InviteCodeItem,
  type CreateInviteCodeRequest,
} from '../services/inviteApi';

// 定义标签类型
type TabType = 'create' | 'manage';

// 排序方向
type SortDirection = 'asc' | 'desc';

// 邀请码表格列
type InviteCodeSortKey = 'code' | 'type' | 'created_at' | 'uses' | 'max_uses' | 'expires_at';

// 使用记录表格列
type UseRecordSortKey = 'used_at' | 'used_by';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: string; // 由父组件传入用户角色（已在 UserProfileModal 中完成鉴权）
}

interface SortConfig<T> {
  key: T;
  direction: SortDirection;
}

export const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose, userRole }) => {
  // 当前标签页
  const [activeTab, setActiveTab] = useState<TabType>('create');
  
  // 创建邀请表单状态
  const [inviteType, setInviteType] = useState<string>('user');
  const [expiresDays, setExpiresDays] = useState<number>(0);
  const [maxUses, setMaxUses] = useState<number>(1);
  const [note, setNote] = useState<string>('');
  
  // 创建状态
  const [isCreating, setIsCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ success: boolean; message: string; code?: string } | null>(null);
  
  // 邀请码列表状态
  const [inviteCodes, setInviteCodes] = useState<InviteCodeItem[]>([]);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [selectedCodeIndex, setSelectedCodeIndex] = useState<number | null>(null);
  const [inviteCodeSort, setInviteCodeSort] = useState<SortConfig<InviteCodeSortKey>>({
    key: 'created_at',
    direction: 'desc',
  });
  
  // 删除状态
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // 使用记录状态
  const [useRecordSort, setUseRecordSort] = useState<SortConfig<UseRecordSortKey>>({
    key: 'used_at',
    direction: 'desc',
  });
  
  // 复制状态
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedUseRecordIndex, setCopiedUseRecordIndex] = useState<number | null>(null);
  
  const modalRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 加载邀请码列表
  const loadInviteCodes = useCallback(async () => {
    setIsLoadingCodes(true);
    try {
      const response = await getInviteCodes();
      setInviteCodes(response.codes);
    } catch (error) {
      console.error('加载邀请码列表失败:', error);
    } finally {
      setIsLoadingCodes(false);
    }
  }, []);

  // 当切换到管理标签页时加载数据
  useEffect(() => {
    if (activeTab === 'manage' && isOpen) {
      loadInviteCodes();
    }
  }, [activeTab, isOpen, loadInviteCodes]);

  // 清理函数
  useEffect(() => {
    if (!isOpen) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setCreateResult(null);
      setDeleteResult(null);
      setSelectedCodeIndex(null);
      setCopiedIndex(null);
      setCopiedUseRecordIndex(null);
    }
  }, [isOpen]);

  // 阻止关闭的处理器
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (isCreating || isDeleting) {
      e.stopPropagation();
      return;
    }
    onClose();
  };

  const handleClose = () => {
    if (isCreating || isDeleting) {
      return;
    }
    onClose();
  };

  // 创建邀请码
  const handleCreateInviteCode = async () => {
    setIsCreating(true);
    setCreateResult(null);
    abortControllerRef.current = new AbortController();

    const requestData: CreateInviteCodeRequest = {
      type: inviteType,
      expires_days: expiresDays,
      max_uses: maxUses,
      note: note.trim() || undefined,
    };

    try {
      const response = await createInviteCode(requestData, abortControllerRef.current.signal);
      setCreateResult({
        success: true,
        message: '邀请码创建成功',
        code: response.code,
      });
      
      // 复制到剪贴板
      navigator.clipboard.writeText(response.code).catch(console.error);
    } catch (error) {
      setCreateResult({
        success: false,
        message: error instanceof Error ? error.message : '创建失败',
      });
    } finally {
      setIsCreating(false);
      abortControllerRef.current = null;
    }
  };

  // 删除邀请码
  const handleDeleteInviteCode = async () => {
    if (selectedCodeIndex === null) return;
    
    const codeToDelete = inviteCodes[selectedCodeIndex];
    setIsDeleting(true);
    setDeleteResult(null);
    abortControllerRef.current = new AbortController();

    try {
      await deleteInviteCode(codeToDelete.code, abortControllerRef.current.signal);
      setDeleteResult({
        success: true,
        message: '邀请码已成功删除',
      });
      
      // 从列表中移除
      setInviteCodes((prev) => prev.filter((_, index) => index !== selectedCodeIndex));
      setSelectedCodeIndex(null);
    } catch (error) {
      setDeleteResult({
        success: false,
        message: error instanceof Error ? error.message : '删除失败',
      });
    } finally {
      setIsDeleting(false);
      abortControllerRef.current = null;
    }
  };

  // 复制邀请码
  const handleCopyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  // 复制 used_by
  const handleCopyUsedBy = (usedBy: string, index: number) => {
    navigator.clipboard.writeText(usedBy).then(() => {
      setCopiedUseRecordIndex(index);
      setTimeout(() => setCopiedUseRecordIndex(null), 2000);
    });
  };

  // 排序邀请码列表
  const sortedInviteCodes = [...inviteCodes].sort((a, b) => {
    const { key, direction } = inviteCodeSort;
    let aValue: string | number = a[key] as string | number;
    let bValue: string | number = b[key] as string | number;

    // 特殊处理 uses 字段（需要使用次数而不是 max_uses）
    if (key === 'uses') {
      aValue = a.uses;
      bValue = b.uses;
    }

    // 处理 null 值
    if (aValue === null || aValue === undefined) aValue = '';
    if (bValue === null || bValue === undefined) bValue = '';

    // 字符串比较
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const comparison = aValue.localeCompare(bValue);
      return direction === 'asc' ? comparison : -comparison;
    }

    // 数字比较
    const aNum = Number(aValue);
    const bNum = Number(bValue);
    const comparison = aNum - bNum;
    return direction === 'asc' ? comparison : -comparison;
  });

  // 处理邀请码表格排序
  const handleInviteCodeSort = (key: InviteCodeSortKey) => {
    setInviteCodeSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  // 获取使用记录（合并 used_by 和 used_at）
  const getUseRecords = () => {
    const records: { used_at: string; used_by: string }[] = [];
    
    if (selectedCodeIndex !== null && inviteCodes[selectedCodeIndex]) {
      const selectedCode = inviteCodes[selectedCodeIndex];
      const usedByList = selectedCode.used_by || [];
      const usedAtList = selectedCode.used_at || [];
      
      for (let i = 0; i < Math.max(usedByList.length, usedAtList.length); i++) {
        records.push({
          used_by: usedByList[i] || '',
          used_at: usedAtList[i] || '',
        });
      }
    }
    
    return records;
  };

  // 排序使用记录
  const sortedUseRecords = getUseRecords().sort((a, b) => {
    const { key, direction } = useRecordSort;
    let aValue = a[key];
    let bValue = b[key];

    if (aValue === null) aValue = '';
    if (bValue === null) bValue = '';

    const comparison = String(aValue).localeCompare(String(bValue));
    return direction === 'asc' ? comparison : -comparison;
  });

  // 处理使用记录表格排序
  const handleUseRecordSort = (key: UseRecordSortKey) => {
    setUseRecordSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  // 渲染排序图标
  const renderSortIcon = (currentKey: string, sortKey: string) => {
    if (currentKey !== sortKey) {
      return <span className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-30">
        <ChevronUp className="w-3 h-3" />
      </span>;
    }
    return inviteCodeSort.direction === 'asc' ? (
      <ChevronUp className="w-3 h-3 ml-1" />
    ) : (
      <ChevronDown className="w-3 h-3 ml-1" />
    );
  };

  // 格式化日期 - 将 UTC 时间转换为本地时间显示
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    // 确保将 UTC 时间字符串正确解析为 UTC，然后转换为本地时间
    // 如果时间字符串不带 Z 或时区信息，手动按 UTC 解析
    const utcDate = new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');
    // 使用 toLocaleString 自动转换为浏览器本地时区
    return utcDate.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // 格式化有效期显示
  const formatExpiresAt = (expiresAt: string | null, expiresDays: number) => {
    if (!expiresAt && expiresDays === 0) return '永久有效';
    if (!expiresAt) return '-';
    return formatDate(expiresAt);
  };

  // 鉴权已在父组件完成，直接渲染
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${
          isCreating || isDeleting ? 'pointer-events-auto' : ''
        }`}
        onClick={handleBackdropClick}
      />

      {/* 邀请管理窗口 */}
      <div
        ref={modalRef}
        className={`relative bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 border border-zinc-700 overflow-hidden ${
          isCreating || isDeleting ? 'pointer-events-auto' : ''
        }`}
        style={{ maxHeight: '85vh' }}
      >
        {/* 关闭按钮 */}
        <button
          onClick={handleClose}
          disabled={isCreating || isDeleting}
          className={`absolute top-4 right-4 z-10 p-2 bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-full transition-colors backdrop-blur-sm ${
            isCreating || isDeleting ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        {/* 窗口内容 */}
        <div className="flex items-center justify-center" style={{ height: '85vh' }}>
          {/* 鉴权已在父组件完成，直接显示内容 */}
          <div className="flex w-full h-full">
            {/* 左侧导航栏 */}
            <div className="w-48 bg-zinc-900/50 border-r border-zinc-700 flex flex-col">
              <div className="p-4 border-b border-zinc-700">
                <h3 className="text-lg font-semibold text-zinc-100">邀请管理</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  角色：{userRole === 'admin' ? '管理员' : '授信用户'}
                </p>
              </div>
              
              <nav className="flex-1 p-2 space-y-1">
                <button
                  onClick={() => setActiveTab('create')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'create'
                      ? 'bg-purple-600/20 text-purple-400 border border-purple-600/30'
                      : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  创建邀请
                </button>
                <button
                  onClick={() => setActiveTab('manage')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'manage'
                      ? 'bg-purple-600/20 text-purple-400 border border-purple-600/30'
                      : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  管理邀请
                </button>
              </nav>
            </div>

            {/* 右侧主要内容区域 */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeTab === 'create' && (
                <div className="flex-1 p-8 overflow-auto">
                  <div className="flex justify-center h-full">
                    <div className="w-full max-w-lg">
                  <h2 className="text-xl font-semibold text-zinc-100 mb-6 text-center">创建邀请码</h2>
                  
                  <div className="space-y-6">
                    {/* 邀请类型 */}
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        邀请码类型
                      </label>
                      <select
                        value={inviteType}
                        onChange={(e) => setInviteType(e.target.value)}
                        disabled={isCreating || userRole !== 'admin'}
                        className={`w-full bg-zinc-700 border border-zinc-600 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                          userRole !== 'admin' ? 'cursor-not-allowed' : ''
                        }`}
                      >
                        <option value="user">普通用户 (user)</option>
                        {userRole === 'admin' && (
                          <option value="trusted">授信用户 (trusted)</option>
                        )}
                      </select>
                      {userRole !== 'admin' && (
                        <p className="text-xs text-zinc-500 mt-1">
                          仅管理员可创建受信任类型的邀请码
                        </p>
                      )}
                    </div>

                    {/* 有效期 */}
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        有效期（天）
                      </label>
                      <input
                        type="number"
                        value={expiresDays}
                        onChange={(e) => setExpiresDays(parseInt(e.target.value) || 0)}
                        min={userRole === 'admin' ? 0 : 1}
                        max={userRole === 'admin' ? 365 : 30}
                        disabled={isCreating}
                        className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <p className="text-xs text-zinc-500 mt-1">
                        {userRole === 'admin'
                          ? '管理员可设置 0（永久有效）或 1-365 天'
                          : '授信用户可设置 1-30 天'}
                      </p>
                    </div>

                    {/* 最大使用次数 */}
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        最大使用次数
                      </label>
                      <input
                        type="number"
                        value={maxUses}
                        onChange={(e) => setMaxUses(parseInt(e.target.value) || 0)}
                        min={userRole === 'admin' ? 0 : 1}
                        max={10}
                        disabled={isCreating}
                        className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <p className="text-xs text-zinc-500 mt-1">
                        {userRole === 'admin'
                          ? '管理员可设置 0（无限制）或 1-10 次'
                          : '授信用户可设置 1-10 次'}
                      </p>
                    </div>

                    {/* 备注 */}
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        备注
                      </label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 255))}
                        maxLength={255}
                        rows={3}
                        disabled={isCreating}
                        placeholder="可选备注信息（最多 255 字符）"
                        className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                      />
                      <p className="text-xs text-zinc-500 mt-1">{note.length}/255</p>
                    </div>

                    {/* 信息框和创建按钮 */}
                    <div className="space-y-3">
                      {createResult && (
                        <div
                          className={`px-4 py-3 rounded-lg text-sm flex items-start gap-2 ${
                            createResult.success
                              ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                              : 'bg-red-600/20 text-red-400 border border-red-600/30'
                          }`}
                        >
                          {createResult.success ? (
                            <Check className="w-5 h-5 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-5 h-5 mt-0.5" />
                          )}
                          <div className="flex-1">
                            {createResult.success && createResult.code ? (
                              <div>
                                <p className="font-medium mb-1">{createResult.message}</p>
                                <p className="font-mono text-lg">{createResult.code}</p>
                                <p className="text-xs mt-1 opacity-70">已自动复制到剪贴板</p>
                              </div>
                            ) : (
                              <p>{createResult.message}</p>
                            )}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={handleCreateInviteCode}
                        disabled={isCreating}
                        className={`w-full flex items-center justify-center gap-2 p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium ${
                          isCreating ? 'animate-pulse' : ''
                        }`}
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            正在创建...
                          </>
                        ) : (
                          <>
                            <Plus className="w-5 h-5" />
                            创建邀请码
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'manage' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-zinc-700">
                    <h2 className="text-xl font-semibold text-zinc-100">管理邀请码</h2>
                  </div>

                  {/* 邀请码表格区域（上方 2/3） */}
                  <div className="flex-1 flex flex-col min-h-0 p-4">
                    <div className="flex-1 bg-zinc-900/30 rounded-lg border border-zinc-700 overflow-hidden flex flex-col">
                      {/* 表格头部 */}
                      <div className="overflow-auto flex-1">
                        <table className="w-full">
                          <thead className="bg-zinc-900/50 sticky top-0">
                            <tr>
                              <th
                                className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:bg-zinc-800/50 group"
                                onClick={() => handleInviteCodeSort('code')}
                              >
                                <div className="flex items-center">
                                  邀请码
                                  {renderSortIcon(inviteCodeSort.key, 'code')}
                                </div>
                              </th>
                              <th
                                className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:bg-zinc-800/50 group"
                                onClick={() => handleInviteCodeSort('type')}
                              >
                                <div className="flex items-center">
                                  类型
                                  {renderSortIcon(inviteCodeSort.key, 'type')}
                                </div>
                              </th>
                              <th
                                className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:bg-zinc-800/50 group"
                                onClick={() => handleInviteCodeSort('created_at')}
                              >
                                <div className="flex items-center">
                                  创建时间
                                  {renderSortIcon(inviteCodeSort.key, 'created_at')}
                                </div>
                              </th>
                              <th
                                className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:bg-zinc-800/50 group"
                                onClick={() => handleInviteCodeSort('uses')}
                              >
                                <div className="flex items-center">
                                  已使用
                                  {renderSortIcon(inviteCodeSort.key, 'uses')}
                                </div>
                              </th>
                              <th
                                className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:bg-zinc-800/50 group"
                                onClick={() => handleInviteCodeSort('max_uses')}
                              >
                                <div className="flex items-center">
                                  最大次数
                                  {renderSortIcon(inviteCodeSort.key, 'max_uses')}
                                </div>
                              </th>
                              <th
                                className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:bg-zinc-800/50 group"
                                onClick={() => handleInviteCodeSort('expires_at')}
                              >
                                <div className="flex items-center">
                                  有效期至
                                  {renderSortIcon(inviteCodeSort.key, 'expires_at')}
                                </div>
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                备注
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-700/50">
                            {isLoadingCodes ? (
                              <tr>
                                <td colSpan={7} className="px-4 py-8 text-center">
                                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-zinc-500" />
                                  <p className="text-zinc-500 text-sm mt-2">加载中...</p>
                                </td>
                              </tr>
                            ) : inviteCodes.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                                  无邀请码，在创建邀请标签页创建一个吧！
                                </td>
                              </tr>
                            ) : (
                              sortedInviteCodes.map((code) => {
                                const originalIndex = inviteCodes.findIndex((c) => c.code === code.code);
                                const isSelected = selectedCodeIndex === originalIndex;
                                return (
                                  <tr
                                    key={code.code}
                                    onClick={() => setSelectedCodeIndex(originalIndex)}
                                    className={`cursor-pointer transition-colors ${
                                      isSelected
                                        ? 'bg-purple-600/20'
                                        : 'hover:bg-zinc-800/50'
                                    }`}
                                  >
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <code className="text-sm font-mono text-zinc-100">
                                          {code.code}
                                        </code>
                                        {isSelected && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCopyCode(code.code, originalIndex);
                                            }}
                                            className="p-1 hover:bg-zinc-700 rounded"
                                            title="复制邀请码"
                                          >
                                            {copiedIndex === originalIndex ? (
                                              <Check className="w-4 h-4 text-green-400" />
                                            ) : (
                                              <Copy className="w-4 h-4 text-zinc-400" />
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <span
                                        className={`px-2 py-1 rounded text-xs font-medium ${
                                          code.type === 'trusted'
                                            ? 'bg-purple-600/20 text-purple-400'
                                            : 'bg-blue-600/20 text-blue-400'
                                        }`}
                                      >
                                        {code.type}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-zinc-300">
                                      {formatDate(code.created_at)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-zinc-300">
                                      {code.uses}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-zinc-300">
                                      {code.max_uses === 0 ? '∞' : code.max_uses}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-zinc-300">
                                      {formatExpiresAt(code.expires_at, expiresDays)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-zinc-400 whitespace-nowrap">
                                      {code.note || '-'}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 删除操作区域 */}
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex-1 bg-zinc-900/30 rounded-lg border border-zinc-700 px-4 py-3">
                        {isDeleting ? (
                          <div className="flex items-center gap-2 text-blue-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm">正在删除...</span>
                          </div>
                        ) : deleteResult ? (
                          <div
                            className={`flex items-center gap-2 text-sm ${
                              deleteResult.success ? 'text-green-400' : 'text-red-400'
                            }`}
                          >
                            {deleteResult.success ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <AlertCircle className="w-5 h-5" />
                            )}
                            <span>{deleteResult.message}</span>
                          </div>
                        ) : selectedCodeIndex !== null ? (
                          <p className="text-sm text-zinc-400">
                            已选中邀请码：<code className="font-mono text-zinc-200">{inviteCodes[selectedCodeIndex]?.code}</code>
                          </p>
                        ) : (
                          <p className="text-sm text-zinc-500">请选择一个邀请码</p>
                        )}
                      </div>
                      <button
                        onClick={handleDeleteInviteCode}
                        disabled={isDeleting || selectedCodeIndex === null}
                        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                          selectedCodeIndex === null
                            ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-700 text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            删除中...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-5 h-5" />
                            删除邀请码
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 使用记录表格区域（下方 1/3） */}
                  <div className="flex-1 flex flex-col min-h-0 border-t border-zinc-700 p-4">
                    <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      使用记录
                    </h3>
                    <div className="flex-1 bg-zinc-900/30 rounded-lg border border-zinc-700 overflow-hidden flex flex-col">
                      <div className="overflow-auto flex-1">
                        <table className="w-full">
                          <thead className="bg-zinc-900/50 sticky top-0">
                            <tr>
                              <th
                                className="px-4 py-2.5 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:bg-zinc-800/50 group"
                                onClick={() => handleUseRecordSort('used_at')}
                              >
                                <div className="flex items-center">
                                  使用时间
                                  {useRecordSort.key === 'used_at' ? (
                                    useRecordSort.direction === 'asc' ? (
                                      <ChevronUp className="w-3 h-3 ml-1" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3 ml-1" />
                                    )
                                  ) : (
                                    <span className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-30">
                                      <ChevronUp className="w-3 h-3" />
                                    </span>
                                  )}
                                </div>
                              </th>
                              <th
                                className="px-4 py-2.5 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:bg-zinc-800/50 group"
                                onClick={() => handleUseRecordSort('used_by')}
                              >
                                <div className="flex items-center">
                                  使用用户
                                  {useRecordSort.key === 'used_by' ? (
                                    useRecordSort.direction === 'asc' ? (
                                      <ChevronUp className="w-3 h-3 ml-1" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3 ml-1" />
                                    )
                                  ) : (
                                    <span className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-30">
                                      <ChevronUp className="w-3 h-3" />
                                    </span>
                                  )}
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-700/50">
                            {sortedUseRecords.length === 0 ? (
                              <tr>
                                <td colSpan={2} className="px-4 py-8 text-center text-zinc-500">
                                  {selectedCodeIndex !== null
                                    ? '该邀请码暂无使用记录'
                                    : '请先选择一个邀请码'}
                                </td>
                              </tr>
                            ) : (
                              sortedUseRecords.map((record, index) => {
                                const originalIndex = getUseRecords().findIndex(
                                  (r) => r.used_at === record.used_at && r.used_by === record.used_by
                                );
                                return (
                                  <tr
                                    key={`${record.used_at}-${record.used_by}-${index}`}
                                    className="hover:bg-zinc-800/50 transition-colors"
                                  >
                                    <td className="px-4 py-2.5 text-sm text-zinc-300">
                                      {formatDate(record.used_at)}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <div className="flex items-center gap-2">
                                        <code className="text-sm font-mono text-zinc-100">
                                          {record.used_by || '-'}
                                        </code>
                                        {record.used_by && (
                                          <button
                                            onClick={() =>
                                              handleCopyUsedBy(record.used_by, originalIndex)
                                            }
                                            className="p-1 hover:bg-zinc-700 rounded"
                                            title="复制邮箱"
                                          >
                                            {copiedUseRecordIndex === originalIndex ? (
                                              <Check className="w-4 h-4 text-green-400" />
                                            ) : (
                                              <Copy className="w-4 h-4 text-zinc-400" />
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InviteModal;