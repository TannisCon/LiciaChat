import React from 'react';
import { X, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface RegistrationStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: 'loading' | 'success' | 'error';
  error?: string;
  countdown: number;
  isSubmitting: boolean;
}

const RegistrationStatusModal: React.FC<RegistrationStatusModalProps> = ({
  isOpen,
  onClose,
  status,
  error = '',
  countdown,
  isSubmitting,
}) => {
  if (!isOpen) return null;

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-12 h-12 text-green-500" />;
      case 'error':
        return <XCircle className="w-12 h-12 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'loading':
        return `正在提交...${countdown > 0 ? `(${countdown}秒)` : ''}`;
      case 'success':
        return '注册成功！';
      case 'error':
        return error || '注册失败';
    }
  };

  const getStatusBg = () => {
    switch (status) {
      case 'loading':
        return 'bg-blue-500/10 border-blue-500/50';
      case 'success':
        return 'bg-green-500/10 border-green-500/50';
      case 'error':
        return 'bg-red-500/10 border-red-500/50';
    }
  };

  const canClose = !isSubmitting;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      {/* 背景遮罩 */}
      <div 
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${canClose ? 'cursor-pointer' : 'cursor-not-allowed'}`}
        onClick={canClose ? onClose : undefined}
      />
      
      {/* 状态窗口 */}
      <div className="relative bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-zinc-700">
        {/* 关闭按钮 - 仅在可关闭时显示 */}
        {canClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* 窗口内容 */}
        <div className="p-8 flex flex-col items-center">
          {/* 状态图标 */}
          <div className="mb-6">
            {getStatusIcon()}
          </div>

          {/* 状态文本 */}
          <div className={`rounded-xl border px-6 py-4 mb-6 w-full ${getStatusBg()}`}>
            <div className="flex items-center justify-center gap-3">
              {status === 'loading' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
              {status === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
              {status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
              <span className={`text-lg font-medium ${
                status === 'loading' ? 'text-blue-400' :
                status === 'success' ? 'text-green-400' :
                'text-red-400'
              }`}>
                {getStatusText()}
              </span>
            </div>
          </div>

          {/* 错误详情 */}
          {status === 'error' && error && (
            <div className="text-zinc-400 text-sm text-center mb-6">
              {error}
            </div>
          )}

          {/* 成功提示 */}
          {status === 'success' && (
            <div className="text-zinc-400 text-sm text-center">
              即将返回登录页面...
            </div>
          )}

          {/* 加载中提示 */}
          {status === 'loading' && (
            <div className="text-zinc-400 text-sm text-center">
              正在验证您的信息，请稍候...
            </div>
          )}

          {/* 底部关闭按钮 - 仅在可关闭时显示 */}
          {canClose && (
            <button
              onClick={onClose}
              className="w-full mt-4 px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-xl transition-colors font-medium"
            >
              {status === 'success' ? '确定' : '关闭'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegistrationStatusModal;
