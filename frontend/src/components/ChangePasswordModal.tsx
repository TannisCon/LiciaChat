import React, { useState } from 'react';
import { X, Lock, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { updatePassword } from '../services/authApi';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type SubmitStatus = 'idle' | 'loading' | 'success' | 'error';

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // 验证表单
  const isFormValid = () => {
    return (
      oldPassword.trim() !== '' &&
      newPassword.length >= 8 &&
      confirmPassword === newPassword
    );
  };

  // 检查密码是否匹配
  const isPasswordMatch = () => {
    return newPassword === confirmPassword && confirmPassword !== '';
  };

  // 重置表单
  const resetForm = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setSubmitStatus('idle');
    setErrorMessage('');
  };

  // 处理关闭
  const handleClose = () => {
    if (submitStatus === 'loading') {
      return;
    }
    resetForm();
    onClose();
  };

  // 提交修改密码
  const handleSubmit = async () => {
    if (!isFormValid()) {
      return;
    }

    setSubmitStatus('loading');
    setErrorMessage('');

    try {
      const response = await updatePassword(oldPassword, newPassword);
      
      setSubmitStatus('success');
      
      // 更新 token
      localStorage.setItem('access_token', response.access_token);
      onSuccess();
      
      // 3 秒后自动关闭
      setTimeout(() => {
        resetForm();
        onClose();
      }, 3000);
      
    } catch (error) {
      setSubmitStatus('error');
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('修改密码失败');
      }
    }
  };

  // 阻止关闭的处理器
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (submitStatus === 'loading') {
      e.stopPropagation();
      return;
    }
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${submitStatus === 'loading' ? 'pointer-events-auto' : ''}`}
        onClick={handleBackdropClick}
      />

      {/* 修改密码弹窗 */}
      <div className={`relative bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-zinc-700 overflow-hidden ${submitStatus === 'loading' ? 'pointer-events-auto' : ''}`}>
        {/* 顶部装饰条 */}
        <div className="h-2 bg-gradient-to-r from-zinc-600 to-zinc-600" />

        {/* 关闭按钮 */}
        <button
          onClick={handleClose}
          disabled={submitStatus === 'loading'}
          className={`absolute top-4 right-4 p-2 bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-full transition-colors backdrop-blur-sm ${submitStatus === 'loading' ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <X className="w-5 h-5" />
        </button>

        {/* 窗口内容 */}
        <div className="px-8 pb-8 pt-6">
          {/* 标题 */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
              <Lock className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-100">修改密码</h2>
              <p className="text-xs text-zinc-500">为了您的账户安全，请定期更换密码</p>
            </div>
          </div>

          {/* 安全提示 */}
          <div className="mb-6 p-4 bg-red-600/10 border border-red-500/30 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-300 font-medium">请妥善保管好您的密码</p>
                <p className="text-xs text-red-400/70 mt-1">密码丢失将无法找回，可能导致账户永久无法访问</p>
              </div>
            </div>
          </div>

          {/* 表单 */}
          <div className="space-y-4 mb-6">
            {/* 旧密码 */}
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">旧密码</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => {
                  setOldPassword(e.target.value);
                  if (submitStatus === 'error') {
                    setSubmitStatus('idle');
                    setErrorMessage('');
                  }
                }}
                disabled={submitStatus === 'loading' || submitStatus === 'success'}
                placeholder="请输入当前密码"
                className={`w-full bg-zinc-700 border-2 rounded-lg px-4 py-2.5 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed ${submitStatus === 'error' && !oldPassword ? 'border-red-500' : 'border-zinc-600'}`}
              />
            </div>

            {/* 新密码 */}
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (submitStatus === 'error') {
                    setSubmitStatus('idle');
                    setErrorMessage('');
                  }
                }}
                disabled={submitStatus === 'loading' || submitStatus === 'success'}
                placeholder="至少 8 个字符"
                minLength={8}
                className={`w-full bg-zinc-700 border-2 rounded-lg px-4 py-2.5 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed ${newPassword.length > 0 && newPassword.length < 8 ? 'border-yellow-500' : 'border-zinc-600'}`}
              />
              <div className="flex items-center gap-2 mt-1.5">
                <div className={`w-2 h-2 rounded-full ${newPassword.length >= 8 ? 'bg-green-500' : 'bg-zinc-600'}`} />
                <span className={`text-xs ${newPassword.length >= 8 ? 'text-green-400' : 'text-zinc-500'}`}>
                  至少 8 个字符
                </span>
              </div>
            </div>

            {/* 确认新密码 */}
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (submitStatus === 'error') {
                    setSubmitStatus('idle');
                    setErrorMessage('');
                  }
                }}
                disabled={submitStatus === 'loading' || submitStatus === 'success'}
                placeholder="请再次输入新密码"
                className={`w-full bg-zinc-700 border-2 rounded-lg px-4 py-2.5 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed ${confirmPassword !== '' && !isPasswordMatch() ? 'border-red-500' : 'border-zinc-600'}`}
              />
              {confirmPassword !== '' && !isPasswordMatch() && (
                <p className="text-xs text-red-400 mt-1">两次输入的密码不一致</p>
              )}
            </div>
          </div>

          {/* 状态显示 */}
          {submitStatus !== 'idle' && (
            <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 w-fit ${
              submitStatus === 'loading' ? 'bg-blue-600/20 text-blue-400' :
              submitStatus === 'success' ? 'bg-green-600/20 text-green-400' :
              'bg-red-600/20 text-red-400'
            }`}>
              {submitStatus === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitStatus === 'success' && <Check className="w-4 h-4" />}
              {submitStatus === 'error' && <AlertTriangle className="w-4 h-4" />}
              <span>
                {submitStatus === 'loading' && '正在修改密码...'}
                {submitStatus === 'success' && '密码修改成功'}
                {submitStatus === 'error' && errorMessage}
              </span>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              disabled={submitStatus === 'loading'}
              className="flex-1 px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isFormValid() || submitStatus === 'loading' || submitStatus === 'success'}
              className={`flex-1 px-4 py-2.5 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                isFormValid() && submitStatus !== 'success'
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-zinc-600 text-zinc-400'
              }`}
            >
              {submitStatus === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitStatus === 'success' && <Check className="w-4 h-4" />}
              {submitStatus === 'loading' ? '提交中...' : submitStatus === 'success' ? '修改成功' : '确认修改'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordModal;