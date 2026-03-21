import React, { useState } from 'react';
import { X, Mail, Lock, Loader2 } from 'lucide-react';
import { login, getCurrentUser } from '../services/authApi';
import { useAuthStore } from '../store/authStore';
import RegistrationModal from './RegistrationModal';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface RegistrationState {
  isOpen: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { setAuthenticated, setUser, setAccessToken, setLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // 注册弹窗状态
  const [registrationState, setRegistrationState] = useState<RegistrationState>({ isOpen: false });

  // 打开注册弹窗
  const handleOpenRegistration = () => {
    setRegistrationState({ isOpen: true });
  };

  // 关闭注册弹窗
  const handleCloseRegistration = () => {
    setRegistrationState({ isOpen: false });
  };

  // 注册成功回调
  const handleRegistrationSuccess = () => {
    // 注册成功后可以做一些操作，比如自动登录或者提示用户登录
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await login(email, password);
      
      // 保存 access token
      localStorage.setItem('access_token', response.access_token);
      
      // 请求用户信息确保正确
      const userInfo = await getCurrentUser();
      
      // 更新 store
      setAuthenticated(true);
      setUser(userInfo);
      setAccessToken(response.access_token);
      setLoading(false);
      
      onSuccess();
      onClose();
      
      // 重置表单
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查邮箱和密码');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 登录窗口 */}
      <div className="relative bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-zinc-700">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 窗口内容 */}
        <div className="p-8">
          {/* 标题 */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-zinc-100 mb-2">登录 LiciaChat</h2>
            <p className="text-zinc-400 text-sm">请输入您的邮箱和密码</p>
          </div>

          {/* 登录表单 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 邮箱输入 */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                邮箱
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-zinc-600"
                  required
                />
              </div>
            </div>

            {/* 密码输入 */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-zinc-600"
                  required
                />
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
                isLoading
                  ? 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>登录中...</span>
                </>
              ) : (
                <span>登录</span>
              )}
            </button>
          </form>

          {/* 注册链接 */}
          <div className="mt-6 text-center">
            <p className="text-sm text-zinc-400">
              已有邀请码？
              <button
                type="button"
                onClick={handleOpenRegistration}
                className="ml-1 text-blue-400 underline hover:text-blue-300"
              >
                使用邀请码注册
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* 注册弹窗 */}
      <RegistrationModal
        isOpen={registrationState.isOpen}
        onClose={handleCloseRegistration}
        onSuccess={handleRegistrationSuccess}
      />
    </div>
  );
};

export default LoginModal;
