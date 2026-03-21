import React, { useState, useRef, useEffect } from 'react';
import { X, Loader2, CheckCircle } from 'lucide-react';

interface EditTitleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (title: string) => Promise<void>;
  currentTitle: string;
  maxLength?: number;
}

const EditTitleModal: React.FC<EditTitleModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentTitle,
  maxLength = 24,
}) => {
  const [inputValue, setInputValue] = useState(currentTitle);
  const [editStatus, setEditStatus] = useState<'idle' | 'editing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 每次 currentTitle 变化时更新 inputValue
  useEffect(() => {
    setInputValue(currentTitle);
  }, [currentTitle]);

  // 重置所有状态
  const resetState = () => {
    setInputValue(currentTitle);
    setEditStatus('idle');
    setErrorMessage('');
  };

  // 处理确认
  const handleConfirm = async () => {
    if (!inputValue.trim()) {
      setEditStatus('error');
      setErrorMessage('标题不能为空');
      return;
    }

    setEditStatus('editing');

    try {
      await onConfirm(inputValue.trim());
      setEditStatus('success');
      // 成功后稍作延迟再关闭弹窗
      setTimeout(() => {
        resetState();
        onClose();
      }, 500);
      return;
    } catch (error) {
      setEditStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '编辑标题失败');
    }
  };

  // 处理关闭（重置状态后关闭）
  const handleClose = () => {
    resetState();
    onClose();
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && editStatus !== 'editing') {
      e.preventDefault();
      handleConfirm();
    }
    if (e.key === 'Escape' && editStatus !== 'editing') {
      handleClose();
    }
  };

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // 限制输入长度（24 个中文字符）
    if (value.length <= maxLength) {
      setInputValue(value);
      if (editStatus === 'error') {
        setEditStatus('idle');
        setErrorMessage('');
      }
    }
  };

  if (!isOpen) return null;

  // 只有编辑中时不允许通过点击背景关闭
  const shouldPreventClose = editStatus === 'editing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={shouldPreventClose ? undefined : handleClose}
      />

      {/* 编辑窗口 */}
      <div className="relative bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-zinc-700 overflow-hidden">
        {/* 关闭按钮（只在空闲和错误时显示） */}
        {!shouldPreventClose && editStatus !== 'success' && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* 标题栏 */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-100">编辑对话标题</h3>
        </div>

        {/* 内容区域 */}
        <div className="px-6 py-5">
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            对话标题
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={editStatus === 'editing'}
              placeholder="请输入对话标题"
              className={`w-full px-4 py-3 bg-zinc-700 text-zinc-100 rounded-xl border focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                editStatus === 'error'
                  ? 'border-red-500/50 focus:ring-red-500/50'
                  : editStatus === 'success'
                  ? 'border-green-500/50 focus:ring-green-500/50'
                  : 'border-zinc-600 focus:ring-blue-500/50 focus:border-blue-500/50'
              }`}
              maxLength={maxLength}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
              {inputValue.length}/{maxLength}
            </div>
          </div>

          {/* 状态提示 */}
          {editStatus === 'editing' && (
            <div className="mt-3 flex items-center gap-2 text-blue-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">正在编辑...</span>
            </div>
          )}

          {editStatus === 'success' && (
            <div className="mt-3 flex items-center gap-2 text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm">标题已更新</span>
            </div>
          )}

          {editStatus === 'error' && errorMessage && (
            <div className="mt-3 bg-red-500/10 border border-red-500/50 rounded-xl p-3 text-red-400 text-sm">
              {errorMessage}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-zinc-700 flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={shouldPreventClose}
            className="px-4 py-2.5 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={shouldPreventClose || !inputValue.trim()}
            className={`px-5 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              editStatus === 'success'
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {editStatus === 'editing' ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                编辑中...
              </span>
            ) : editStatus === 'success' ? (
              '已完成'
            ) : (
              '确认'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditTitleModal;