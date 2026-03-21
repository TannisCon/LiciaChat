import React from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  chatTitle: string;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
  deleteStatus: 'idle' | 'deleting' | 'success' | 'error';
  errorMessage?: string;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  chatTitle,
  onClose,
  onConfirm,
  isDeleting,
  deleteStatus,
  errorMessage,
}) => {
  if (!isOpen) return null;

  // 只有删除中时不允许通过点击背景关闭
  const shouldPreventClose = isDeleting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={shouldPreventClose ? undefined : onClose}
      />

      {/* 确认窗口 */}
      <div className="relative bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-zinc-700">
        {/* 关闭按钮（只在空闲和错误时显示） */}
        {!isDeleting && deleteStatus !== 'success' && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* 窗口内容 */}
        <div className="p-6">
          {/* 图标和标题 */}
          <div className="flex items-center gap-4 mb-6">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              deleteStatus === 'error'
                ? 'bg-red-600/20'
                : 'bg-orange-600/20'
            }`}>
              {deleteStatus === 'error' ? (
                <AlertTriangle className="w-6 h-6 text-red-400" />
              ) : (
                <Trash2 className="w-6 h-6 text-orange-400" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-zinc-100">
                {deleteStatus === 'success' ? '删除成功' : 
                 deleteStatus === 'error' ? '删除失败' :
                 '删除对话'}
              </h3>
              <p className="text-sm text-zinc-400 truncate">
                {chatTitle}
              </p>
            </div>
          </div>

          {/* 消息内容 */}
          {deleteStatus === 'idle' && (
            <p className="text-zinc-300 mb-6">
              确定要删除这个对话吗？此操作无法撤销。
            </p>
          )}

          {deleteStatus === 'deleting' && (
            <div className="flex items-center gap-3 text-zinc-400 mb-6">
              <div className="w-5 h-5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
              <span>正在删除...</span>
            </div>
          )}

          {deleteStatus === 'success' && (
            <div className="flex items-center gap-3 text-green-400 mb-6">
              <div className="w-5 h-5 bg-green-600/20 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12">
                  <path d="M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 0l4-4-1.414-1.414-4 4 1.414 1.414z"/>
                </svg>
              </div>
              <span>删除成功！</span>
            </div>
          )}

          {deleteStatus === 'error' && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-3 text-red-400 text-sm mb-6">
              {errorMessage || '删除失败，请稍后重试'}
            </div>
          )}

          {/* 按钮区域 */}
          <div className="flex gap-3">
            {deleteStatus === 'idle' && (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-xl transition-colors font-medium"
                >
                  取消
                </button>
                <button
                  onClick={onConfirm}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors font-medium"
                >
                  删除
                </button>
              </>
            )}

            {deleteStatus === 'deleting' && (
              <button
                disabled
                className="flex-1 px-4 py-2.5 bg-zinc-600 text-zinc-400 rounded-xl cursor-not-allowed font-medium"
              >
                正在删除...
              </button>
            )}

            {deleteStatus === 'success' && (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium transition-colors"
              >
                删除成功
              </button>
            )}

            {deleteStatus === 'error' && (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-xl transition-colors font-medium"
                >
                  取消
                </button>
                <button
                  onClick={onConfirm}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors font-medium"
                >
                  重试
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;