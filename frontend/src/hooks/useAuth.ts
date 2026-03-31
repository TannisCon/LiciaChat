import { useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { getCurrentUser, refreshToken, logout as logoutAndBackend } from '../services/authApi';

const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 分钟

export const useAuth = () => {
  const {
    isAuthenticated,
    isLoading,
    user,
    accessToken,
    refreshRetryCount,
    setAuthenticated,
    setUser,
    setAccessToken,
    setLoading,
    incrementRefreshRetry,
    resetRefreshRetry,
    logout: logoutStore,
  } = useAuthStore();

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * 刷新 token
   * 注意：axios 拦截器已自动处理 token 注入和 401 重试，
   * 此处的 refreshToken 使用 refreshClient 绕过拦截器
   */
  const performRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const response = await refreshToken();

      // 若无 refresh token，静默返回 false
      if (!response) {
        return false;
      }

      // 保存新的 access token
      localStorage.setItem('access_token', response.access_token);
      setAccessToken(response.access_token);
      resetRefreshRetry();

      // 获取用户信息确保正确
      // 注意：此时 token 已更新，getCurrentUser 会使用新 token
      const userInfo = await getCurrentUser();
      setUser(userInfo);
      setAuthenticated(true);
      setLoading(false);

      return true;
    } catch (error) {
      console.error('Refresh token 失败:', error);
      incrementRefreshRetry();
      return false;
    }
  }, [
    setAccessToken,
    resetRefreshRetry,
    setUser,
    setAuthenticated,
    setLoading,
    incrementRefreshRetry,
  ]);

  // 初始化认证状态
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('access_token');

      if (token) {
        // 有 access token，先尝试获取用户信息
        // 注意：如果 token 过期，后端返回 401 INVALID_TOKEN，
        // axios 拦截器会自动处理 refresh 并重试
        try {
          const userInfo = await getCurrentUser();
          setUser(userInfo);
          setAuthenticated(true);
          setAccessToken(token);
          setLoading(false);
          return;
        } catch {
          // access token 可能过期，尝试 refresh
          // axios 拦截器已自动处理，这里会触发 refresh 流程
        }
      }

      // 尝试使用 refresh token (从 cookie)
      const success = await performRefresh();

      if (!success && refreshRetryCount < 1) {
        // 重试一次
        await performRefresh();
      }

      // 如果还是失败，保持未登录状态
      setLoading(false);
      setAuthenticated(false);
    };

    initAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 定时刷新 token
  useEffect(() => {
    if (isAuthenticated) {
      // 清除之前的定时器
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }

      // 设置新的定时器
      refreshTimerRef.current = setInterval(() => {
        performRefresh();
      }, REFRESH_INTERVAL);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [isAuthenticated, performRefresh]);

  // 登录处理
  const login = useCallback(() => {
    // 登录逻辑在 LoginModal 中处理
  }, []);

  // 登出处理
  const logout = useCallback(async () => {
    // 调用 authApi 中的 logout 函数，它会自动：
    // 1. 调用后端 API 清除 refresh token cookie
    // 2. 清除 localStorage 和 sessionStorage 中的 access_token
    // 3. 清除所有认证相关的 cookie
    await logoutAndBackend();

    // 清除 store 状态
    logoutStore();
    setLoading(true);
  }, [logoutStore, setLoading]);

  return {
    isAuthenticated,
    isLoading,
    user,
    accessToken,
    login,
    logout,
  };
};