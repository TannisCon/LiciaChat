import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User, Key, Link as LinkIcon, Shield, AlertTriangle, ChevronDown } from 'lucide-react';
import { register } from '../services/authApi';
import validator from 'validator';
import PolicyModal from './PolicyModal';
import RegistrationStatusModal from './RegistrationStatusModal';

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// Base32 字符集
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const RegistrationModal: React.FC<RegistrationModalProps> = ({ isOpen, onClose, onSuccess }) => {
  // 表单状态
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('bailian');
  const [baseUrl, setBaseUrl] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);

  // UI 状态
  const [inviteCodeError, setInviteCodeError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [baseUrlError, setBaseUrlError] = useState('');
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  
  // 弹窗状态
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyType, setPolicyType] = useState<'terms' | 'privacy'>('terms');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [submitError, setSubmitError] = useState('');
  const [countdown, setCountdown] = useState(0);

  // 邀请码输入处理 - 自动转大写并验证 Base32 字符
  const handleInviteCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    const invalidChar = value.split('').find(char => !BASE32_CHARS.includes(char));
    
    if (invalidChar) {
      setInviteCodeError(`包含无效字符 "${invalidChar}"，请检查输入是否正确`);
    } else {
      setInviteCodeError('');
    }
    
    if (value.length > 0 && value.length < 12) {
      setInviteCodeError('邀请码长度必须为 12 位');
    }
    
    setInviteCode(value);
  };

  // Email 输入处理
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    
    if (value.length > 254) {
      setEmailError('邮箱地址超过最大长度限制（254 字符）');
    } else if (value.length > 0 && !validator.isEmail(value)) {
      setEmailError('请输入有效的邮箱地址');
    } else {
      setEmailError('');
    }
  };

  // Base URL 输入处理
  const handleBaseUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setBaseUrl(value);
    
    if (value.length > 0) {
      // 使用 validator 验证 URL
      const isValidUrl = validator.isURL(value, {
        protocols: ['http', 'https'],
        require_protocol: true,
        require_host: true,
        require_tld: false,
        allow_underscores: true,
        allow_fragments: false,
        allow_query_components: false,
        validate_length: false,
      });
      
      if (!isValidUrl) {
        setBaseUrlError('请输入有效的 URL（必须以 http:// 或 https:// 开头）');
      } else {
        setBaseUrlError('');
      }
    } else {
      setBaseUrlError('');
    }
  };

  // 验证表单
  const isFormValid = (): boolean => {
    // 邀请码验证
    if (inviteCode.length !== 12) return false;
    if (inviteCodeError) return false;
    
    // 邮箱验证
    if (!email || email.length > 254) return false;
    if (emailError || !validator.isEmail(email)) return false;
    
    // 用户名验证
    if (!username || !username.trim()) return false;
    
    // 密码验证
    if (password.length < 8) return false;
    if (password !== confirmPassword) return false;
    
    // API Key 验证
    if (!apiKey || !apiKey.trim()) return false;
    
    // Base URL 验证
    if (!baseUrl || baseUrlError) return false;
    const isValidUrl = baseUrl.startsWith('http://') || baseUrl.startsWith('https://');
    if (!isValidUrl) return false;
    
    // 协议同意
    if (!agreeTerms) return false;
    
    return true;
  };

  // 打开协议弹窗
  const openPolicyModal = (type: 'terms' | 'privacy') => {
    setPolicyType(type);
    setShowPolicyModal(true);
  };

  // 提交处理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isFormValid()) {
      return;
    }

    setIsSubmitting(true);
    setShowStatusModal(true);
    setSubmitStatus('loading');
    setSubmitError('');
    setCountdown(0);

    // 倒计时
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 0) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    setCountdown(15);

    try {
      await register(
        inviteCode,
        email.toLowerCase().trim(),
        username,
        password,
        apiKey,
        provider,
        baseUrl,
        undefined,
        15000
      );

      clearInterval(countdownInterval);
      setSubmitStatus('success');
      
      // 重置表单
      setInviteCode('');
      setEmail('');
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setApiKey('');
      setProvider('bailian');
      setBaseUrl('');
      setAgreeTerms(false);
      
      // 3 秒后关闭并回调
      setTimeout(() => {
        setShowStatusModal(false);
        onSuccess();
        onClose();
      }, 3000);
    } catch (err) {
      clearInterval(countdownInterval);
      setSubmitStatus('error');
      setSubmitError(err instanceof Error ? err.message : '注册失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 关闭弹窗时清理状态
  useEffect(() => {
    if (!isOpen) {
      setInviteCode('');
      setEmail('');
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setApiKey('');
      setProvider('bailian');
      setBaseUrl('');
      setAgreeTerms(false);
      setInviteCodeError('');
      setEmailError('');
      setBaseUrlError('');
      setShowStatusModal(false);
      setSubmitStatus('loading');
      setSubmitError('');
      setCountdown(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* 背景遮罩 */}
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        
        {/* 注册窗口 */}
        <div className="relative bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 border border-zinc-700 max-h-[90vh] overflow-y-auto">
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* 窗口内容 */}
          <div className="p-8">
            {/* 标题 */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-zinc-100 mb-2">用户注册</h2>
              <p className="text-zinc-400 text-sm">使用邀请码注册新账号</p>
            </div>

            {/* 风险警示 */}
            <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="text-yellow-400 text-xs space-y-2">
                  <p>• 您必须确保您输入的 API Key 信息有效，注册过程中会进行检查，检查将会消耗少量 API 配额</p>
                  <p>• 您的 API Key 将被加密存储于服务器中，服务器管理员『能够』解密您的 API Key</p>
                  <p>• 您在使用服务的过程中，应当自行关注 API 配额消耗，发现异常请及时更换或清除 API Key</p>
                  <p>• 注册前请详细阅读<a href="#" onClick={(e) => { e.preventDefault(); openPolicyModal('terms'); }} className="underline hover:text-yellow-300">《用户协议》</a>和<a href="#" onClick={(e) => { e.preventDefault(); openPolicyModal('privacy'); }} className="underline hover:text-yellow-300">《隐私政策》</a>，注册和使用该服务视为同意上述协议内容</p>
                </div>
              </div>
            </div>

            {/* 注册表单 */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 邀请码输入 */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  邀请码
                </label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={handleInviteCodeChange}
                    placeholder="请输入 12 位邀请码"
                    maxLength={12}
                    className={`w-full bg-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border ${
                      inviteCodeError ? 'border-red-500/50' : 'border-zinc-600'
                    } uppercase`}
                  />
                </div>
                {inviteCodeError && (
                  <p className="mt-1 text-xs text-red-400">{inviteCodeError}</p>
                )}
              </div>

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
                    onChange={handleEmailChange}
                    placeholder="your@email.com"
                    maxLength={254}
                    className={`w-full bg-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border ${
                      emailError ? 'border-red-500/50' : 'border-zinc-600'
                    }`}
                  />
                </div>
                {emailError && (
                  <p className="mt-1 text-xs text-red-400">{emailError}</p>
                )}
              </div>

              {/* 用户名输入 */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  用户名
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="请输入用户名"
                    maxLength={16}
                    className="w-full bg-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-zinc-600"
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
                    placeholder="至少 8 位密码"
                    minLength={8}
                    className="w-full bg-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-zinc-600"
                  />
                </div>
                {password.length > 0 && password.length < 8 && (
                  <p className="mt-1 text-xs text-red-400">密码长度必须至少 8 位</p>
                )}
              </div>

              {/* 密码二次确认 */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  确认密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    className={`w-full bg-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border ${
                      confirmPassword && password !== confirmPassword ? 'border-red-500/50' : 'border-zinc-600'
                    }`}
                  />
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1 text-xs text-red-400">两次输入的密码不一致</p>
                )}
                <p className="mt-1 text-xs text-zinc-500">请妥善保管密码，密码丢失将无法找回</p>
              </div>

              {/* API Key 输入 */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  API Key
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="请输入你的 API Key"
                    className="w-full bg-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-zinc-600"
                  />
                </div>
              </div>

              {/* 提供商下拉菜单 */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  提供商
                </label>
                <div className="relative">
                  <div
                    onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                    className="w-full bg-zinc-700 text-zinc-100 rounded-xl pl-4 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-zinc-600 cursor-pointer flex items-center justify-between"
                  >
                    <span>{provider === 'bailian' ? '阿里云百炼' : 'vLLM'}</span>
                    <ChevronDown className={`w-5 h-5 transition-transform ${showProviderDropdown ? 'rotate-180' : ''}`} />
                  </div>
                  {showProviderDropdown && (
                    <div className="absolute z-20 w-full mt-1 bg-zinc-700 border border-zinc-600 rounded-xl shadow-lg">
                      <div
                        onClick={() => {
                          setProvider('bailian');
                          setShowProviderDropdown(false);
                        }}
                        className="px-4 py-3 hover:bg-zinc-600 cursor-pointer rounded-t-xl text-zinc-100"
                      >
                        阿里云百炼
                      </div>
                      <div className="px-4 py-3 text-zinc-500 cursor-not-allowed border-t border-zinc-600">
                        vLLM（暂不可用）
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Base URL 输入 */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Base URL
                </label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={handleBaseUrlChange}
                    placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                    className={`w-full bg-zinc-700 text-zinc-100 placeholder-zinc-500 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border ${
                      baseUrlError ? 'border-red-500/50' : 'border-zinc-600'
                    }`}
                  />
                </div>
                {baseUrlError && (
                  <p className="mt-1 text-xs text-red-400">{baseUrlError}</p>
                )}
              </div>

              {/* 协议同意 checkbox */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="agreeTerms"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-blue-600 focus:ring-blue-500/50"
                />
                <label htmlFor="agreeTerms" className="text-sm text-zinc-400">
                  我同意<a href="#" onClick={(e) => { e.preventDefault(); openPolicyModal('terms'); }} className="text-blue-400 underline hover:text-blue-300">《用户协议》</a>和<a href="#" onClick={(e) => { e.preventDefault(); openPolicyModal('privacy'); }} className="text-blue-400 underline hover:text-blue-300">《隐私政策》</a>
                </label>
              </div>

              {/* 提交按钮 */}
              <button
                type="submit"
                disabled={!isFormValid() || isSubmitting}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
                  !isFormValid() || isSubmitting
                    ? 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
                }`}
              >
                <span>注册</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* 协议展示弹窗 */}
      <PolicyModal
        isOpen={showPolicyModal}
        onClose={() => setShowPolicyModal(false)}
        policyType={policyType}
      />

      {/* 注册状态指示弹窗 */}
      <RegistrationStatusModal
        isOpen={showStatusModal}
        onClose={() => {
          setShowStatusModal(false);
          if (submitStatus === 'error') {
            // 错误时清空表单
            setInviteCode('');
            setEmail('');
            setUsername('');
            setPassword('');
            setConfirmPassword('');
            setApiKey('');
            setProvider('bailian');
            setBaseUrl('');
            setAgreeTerms(false);
          }
        }}
        status={submitStatus}
        error={submitError}
        countdown={countdown}
        isSubmitting={isSubmitting}
      />
    </>
  );
};

export default RegistrationModal;