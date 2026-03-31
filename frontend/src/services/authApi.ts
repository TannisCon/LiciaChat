import type { UserInfo } from '../store/authStore';
import { authClient, noAuthClient, refreshClient } from './apiClient';

// 登录接口
export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserInfo;
  refresh_token_in_cookie: boolean;
}

/**
 * 用户登录
 * @param email - 用户邮箱
 * @param password - 密码
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await noAuthClient.post<LoginResponse>('/auth/login', {
    email,
    password,
  });
  return response.data;
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser(): Promise<UserInfo> {
  const response = await authClient.get<UserInfo>('/user/me');
  return response.data;
}

// 刷新 token
export interface RefreshResponse {
  access_token: string;
  token_type: string;
}

/**
 * 检查本地是否存在 refresh token
 * 由于 refresh token 存储在 HttpOnly cookie 中，前端无法直接读取
 * 这里通过检查是否有已保存的登录状态来判断
 */
function hasRefreshToken(): boolean {
  // 检查 localStorage 中是否有 access_token（表明用户已登录）
  // 如果有 access_token，说明可能存在 refresh token（在 cookie 中）
  // 如果没有 access_token，说明用户未登录或已登出，此时无需刷新
  return (
    localStorage.getItem('access_token') !== null ||
    sessionStorage.getItem('access_token') !== null
  );
}

/**
 * 刷新 token
 * 使用 refreshClient 绕过拦截器，避免递归
 */
export async function refreshToken(): Promise<RefreshResponse | null> {
  // 在调用刷新接口前先检查本地是否有 refresh token
  // 若无 refresh token 则静默返回 null，不发请求
  if (!hasRefreshToken()) {
    return null;
  }

  const response = await refreshClient.post<RefreshResponse>('/auth/refresh', null, {
    withCredentials: true,
  });
  return response.data;
}

/**
 * 登出接口 - 调用后端 API 清除 refresh token cookie
 * 使用 noAuthClient，因为登出时 token 可能已失效
 */
export async function logoutBackend(): Promise<{ message: string; logged_out: boolean }> {
  const response = await noAuthClient.post<{ message: string; logged_out: boolean }>(
    '/auth/logout'
  );
  return response.data;
}

/**
 * 登出（清除本地状态）
 */
export async function logout() {
  // 先调用后端 API 清除 refresh token cookie
  try {
    await logoutBackend();
  } catch (error) {
    // 即使后端调用失败，也要清除本地状态
    console.error('登出 API 调用失败:', error);
  }

  // 清除 localStorage 中的 access_token
  localStorage.removeItem('access_token');
  sessionStorage.removeItem('access_token');

  // 清除所有可能的认证相关 cookie
  // 需要清除不同路径的 cookie：/ 和 /api/auth
  const pathsToClear = ['/', '/api/auth'];

  // 所有可能的 cookie 名称
  const allCookieNames = [
    'refresh_token',
    'refreshToken',
    'refresh-token',
    'access_token',
    'accessToken',
    'access-token',
    'token',
    'auth_token',
    'session',
  ];

  // 遍历所有路径和 cookie 名称组合进行清除
  pathsToClear.forEach((path) => {
    allCookieNames.forEach((cookieName) => {
      // 清除当前路径的 cookie
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path};`;
      // 清除根路径的 cookie（带域名）
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${window.location.hostname};`;
      // 尝试清除可能设置了 www 前缀的 cookie
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=www.${window.location.hostname};`;
    });
  });

  // 额外遍历当前 document.cookie 中实际存在的 cookie 进行清除（确保不遗漏）
  const cookies = document.cookie.split(';');
  cookies.forEach((cookie) => {
    const cookieName = cookie.split('=')[0].trim().toLowerCase();
    if (allCookieNames.some((name) => name.toLowerCase() === cookieName)) {
      pathsToClear.forEach((path) => {
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path};`;
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${window.location.hostname};`;
      });
    }
  });
}

// 更新用户名接口
export interface UpdateUsernameRequest {
  username: string;
}

export interface UpdateUsernameResponse {
  uid: number;
  uuid: string;
  email: string;
  username: string;
  role: string;
  created_at: string;
}

/**
 * 更新用户名
 * @param username - 新用户名
 * @param _signal - AbortSignal 用于取消请求（暂不使用，axios 有自己的 timeout）
 */
export async function updateUsername(
  username: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _signal?: AbortSignal
): Promise<UpdateUsernameResponse> {
  const response = await authClient.patch<UpdateUsernameResponse>('/user/me', {
    username,
  });
  return response.data;
}

// API Key 信息接口
export interface ApiKeyInfo {
  api_key_masked: string | null;
  status: 'valid' | 'quota' | 'invalid' | 'pending';
  provider: 'bailian' | 'vllm';
  base_url: string;
  updated_at: string | null;
}

/**
 * 获取 API Key 信息
 */
export async function getApiKeyInfo(): Promise<ApiKeyInfo> {
  const response = await authClient.get<ApiKeyInfo>('/user/apikey');
  return response.data;
}

// 更新密码接口
export interface UpdatePasswordRequest {
  old_password: string;
  new_password: string;
}

export interface UpdatePasswordResponse {
  access_token: string;
  token_type: string;
  refresh_token_in_cookie: boolean;
}

/**
 * 更新密码
 * @param oldPassword - 旧密码
 * @param newPassword - 新密码
 */

export async function updatePassword(
  oldPassword: string,
  newPassword: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _signal?: AbortSignal
): Promise<UpdatePasswordResponse> {
  const response = await authClient.patch<UpdatePasswordResponse>('/user/password', {
    old_password: oldPassword,
    new_password: newPassword,
  });
  return response.data;
}

// API Key 更新/清除接口
export interface UpdateApiKeyRequest {
  action: 'update' | 'clear';
  api_key?: string;
  provider?: string;
  base_url?: string;
}

export interface UpdateApiKeyResponse {
  api_key_masked: string | null;
  status: string;
  provider: string;
  base_url: string;
  updated_at: string | null;
}

/**
 * 更新或清除 API Key
 * @param action - 操作类型：'update' 或 'clear'
 * @param apiKey - 明文 API Key（update 操作时必需）
 * @param provider - Key 提供商（update 操作时必需）
 * @param baseUrl - API Base URL（update 操作时必需）
 * @param _signal - AbortSignal 用于取消请求（暂不使用）
 * @param _timeout - 超时时间（毫秒），默认 15000（暂不使用，使用 axios 默认超时）
 */
export async function updateApiKey(
  action: 'update' | 'clear',
  apiKey?: string,
  provider?: string,
  baseUrl?: string,
  _signal?: AbortSignal,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _timeout: number = 15000
): Promise<UpdateApiKeyResponse> {
  const body: UpdateApiKeyRequest = { action };
  if (action === 'update') {
    body.api_key = apiKey;
    body.provider = provider;
    body.base_url = baseUrl;
  }

  const response = await authClient.post<UpdateApiKeyResponse>('/user/apikey', body);
  return response.data;
}

// 用户注册接口
export interface RegisterRequest {
  invite_code: string;
  email: string;
  username: string;
  password: string;
  api_key: string;
  key_provider: string;
  base_url: string;
}

export interface RegisterResponse {
  uid: number;
  uuid: string;
  email: string;
  username: string;
  role: string;
  created_at: string;
}

/**
 * 用户注册
 * @param inviteCode - 邀请码
 * @param email - 用户邮箱
 * @param username - 用户名
 * @param password - 密码
 * @param apiKey - API Key
 * @param keyProvider - Key 提供商 ("bailian" 或 "vllm")
 * @param baseUrl - API Base URL
 * @param _signal - AbortSignal 用于取消请求（暂不使用）
 * @param _timeout - 超时时间（毫秒），默认 15000（暂不使用）
 */
export async function register(
  inviteCode: string,
  email: string,
  username: string,
  password: string,
  apiKey: string,
  keyProvider: string,
  baseUrl: string,
  _signal?: AbortSignal,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _timeout: number = 15000
): Promise<RegisterResponse> {
  const response = await noAuthClient.post<RegisterResponse>('/auth/register', {
    invite_code: inviteCode,
    email,
    username,
    password,
    api_key: apiKey,
    key_provider: keyProvider,
    base_url: baseUrl,
  });
  return response.data;
}