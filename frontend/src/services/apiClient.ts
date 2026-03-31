import axios from 'axios';
import type {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';

// ============================================================================
// 模块级单例状态
// ============================================================================
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];
let refreshErrorSubscribers: (() => void)[] = [];

// 订阅 token 刷新成功
const subscribeTokenRefresh = (cb: (token: string) => void): (() => void) => {
  refreshSubscribers.push(cb);
  return () => {
    refreshSubscribers = refreshSubscribers.filter((fn) => fn !== cb);
  };
};

// 订阅刷新错误
const subscribeRefreshError = (cb: () => void): (() => void) => {
  refreshErrorSubscribers.push(cb);
  return () => {
    refreshErrorSubscribers = refreshErrorSubscribers.filter((fn) => fn !== cb);
  };
};

// 执行成功回调
const onRefreshed = (token: string) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
  refreshErrorSubscribers = [];
};

// 执行错误回调
const onRefreshFailed = () => {
  refreshErrorSubscribers.forEach((cb) => cb());
  refreshErrorSubscribers = [];
  refreshSubscribers = [];
};

// ============================================================================
// 创建 Axios 实例
// ============================================================================

/**
 * 创建认证客户端（带 token 注入和 401 处理）
 * @param baseURL - API 基础路径
 * @param timeout - 超时时间（毫秒）
 */
const createAuthClient = (baseURL: string, timeout: number): AxiosInstance => {
  const client = axios.create({
    baseURL,
    timeout,
    headers: { 'Content-Type': 'application/json' },
  });

  // 请求拦截器 - 注入 token
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = localStorage.getItem('access_token');
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error: AxiosError) => Promise.reject(error)
  );

  // 响应拦截器 - 处理 401 INVALID_TOKEN
  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      // 检查 error.config 是否存在
      if (!error.config) {
        return Promise.reject(error);
      }

      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
      };

      // 检查是否是 INVALID_TOKEN
      const responseData = error.response?.data as
        | { detail?: string; error?: string }
        | undefined;
      const isInvalidToken =
        responseData?.detail?.includes('INVALID_TOKEN') ||
        responseData?.error === 'INVALID_TOKEN';

      // 只有 INVALID_TOKEN 才触发 refresh，且只重试 1 次
      if (
        error.response?.status === 401 &&
        isInvalidToken &&
        !originalRequest._retry
      ) {
        if (isRefreshing) {
          // 已在刷新，加入队列等待
          return new Promise((resolve, reject) => {
            const unsubscribe = subscribeTokenRefresh((token: string) => {
              // ✅ 安全处理 headers
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${token}`;
              // ✅ 执行后立即 unsubscribe，防止重复执行和内存泄漏
              unsubscribe();
              resolve(client(originalRequest));
            });

            const errorUnsubscribe = subscribeRefreshError(() => {
              errorUnsubscribe();
              unsubscribe();
              reject(new Error('Token refresh failed'));
            });
          });
        }

        // 开始刷新流程
        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const response = await refreshClient.post('/auth/refresh', null, {
            withCredentials: true,
          });

          const { access_token } = response.data as { access_token: string };
          localStorage.setItem('access_token', access_token);

          // ✅ 更新默认 header，确保后续请求也使用新 token
          client.defaults.headers.common.Authorization = `Bearer ${access_token}`;

          isRefreshing = false;
          onRefreshed(access_token);

          // 重试原请求
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return client(originalRequest);
        } catch (refreshError) {
          isRefreshing = false;
          onRefreshFailed();
          localStorage.removeItem('access_token');
          return Promise.reject(refreshError);
        }
      }

      // 其他 401 或其他错误直接抛出
      return Promise.reject(error);
    }
  );

  return client;
};

// 1. 无需认证的客户端（register, logout 等）
export const noAuthClient: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' },
});

// 2. Refresh token 专用客户端（绕过所有拦截器）
export const refreshClient: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' },
});

// 3. 需要认证的客户端（默认 5 秒超时）
export const authClient: AxiosInstance = createAuthClient('/api', 5000);

// 4. 长超时认证客户端（用于可能存在的耗时请求）
export const authClientLong: AxiosInstance = createAuthClient('/api', 30000);

// 5. 模型列表专用客户端（v1/models 端点没有/api/前缀，长超时）
export const modelsClient: AxiosInstance = createAuthClient('', 30000);

export default authClient;