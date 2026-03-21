import type { UserInfo } from '../store/authStore';

const API_BASE_URL = '/api';

// 通用请求处理函数
async function handleRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '请求失败' }));
    throw new Error(error.detail || '请求失败');
  }

  return response.json();
}

// 登录接口
export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserInfo;
  refresh_token_in_cookie: boolean;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return handleRequest<LoginResponse>(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// 获取当前用户信息
export async function getCurrentUser(): Promise<UserInfo> {
  const token = localStorage.getItem('access_token');
  return handleRequest<UserInfo>(`${API_BASE_URL}/user/me`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
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
  return localStorage.getItem('access_token') !== null || 
         sessionStorage.getItem('access_token') !== null;
}

export async function refreshToken(): Promise<RefreshResponse | null> {
  // 在调用刷新接口前先检查本地是否有 refresh token
  // 若无 refresh token 则静默返回 null，不发请求
  if (!hasRefreshToken()) {
    return null;
  }
  
  return handleRequest<RefreshResponse>(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    // credentials: 'include' 会自动发送 cookie
    credentials: 'include',
  });
}

// 登出接口 - 调用后端 API 清除 refresh token cookie
export async function logoutBackend(): Promise<{ message: string; logged_out: boolean }> {
  return handleRequest<{ message: string; logged_out: boolean }>(
    `${API_BASE_URL}/auth/logout`,
    {
      method: 'POST'
      // credentials: 'include', // 无需携带 cookie
    }
  );
}

// 登出（清除本地状态）
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
    'refresh_token', 'refreshToken', 'refresh-token',
    'access_token', 'accessToken', 'access-token',
    'token', 'auth_token', 'session'
  ];
  
  // 遍历所有路径和 cookie 名称组合进行清除
  pathsToClear.forEach(path => {
    allCookieNames.forEach(cookieName => {
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
  cookies.forEach(cookie => {
    const cookieName = cookie.split('=')[0].trim().toLowerCase();
    if (allCookieNames.some(name => name.toLowerCase() === cookieName)) {
      pathsToClear.forEach(path => {
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

export async function updateUsername(
  username: string,
  signal?: AbortSignal
): Promise<UpdateUsernameResponse> {
  const token = localStorage.getItem('access_token');
  
  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 5000); // 5 秒超时
  
  try {
    const response = await fetch(`${API_BASE_URL}/user/me`, {
      method: 'PATCH',
      signal: signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ username }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '请求失败' }));
      throw new Error(error.detail || '请求失败');
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('服务器无响应，请检查网络连接');
    }
    throw error;
  }
}

// API Key 信息接口
export interface ApiKeyInfo {
  api_key_masked: string | null;
  status: 'valid' | 'quota' | 'invalid' | 'pending';
  provider: 'bailian' | 'vllm';
  base_url: string;
  updated_at: string | null;
}

// 获取 API Key 信息
export async function getApiKeyInfo(): Promise<ApiKeyInfo> {
  const token = localStorage.getItem('access_token');
  return handleRequest<ApiKeyInfo>(`${API_BASE_URL}/user/apikey`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
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

export async function updatePassword(
  oldPassword: string,
  newPassword: string,
  signal?: AbortSignal
): Promise<UpdatePasswordResponse> {
  const token = localStorage.getItem('access_token');
  
  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 5000); // 5 秒超时
  
  try {
    const response = await fetch(`${API_BASE_URL}/user/password`, {
      method: 'PATCH',
      signal: signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ 
        old_password: oldPassword, 
        new_password: newPassword 
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '请求失败' }));
      throw new Error(error.detail || '请求失败');
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('服务器无响应，请检查网络连接');
    }
    throw error;
  }
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
 * @param signal - AbortSignal 用于取消请求
 * @param timeout - 超时时间（毫秒），默认 15000
 */
export async function updateApiKey(
  action: 'update' | 'clear',
  apiKey?: string,
  provider?: string,
  baseUrl?: string,
  signal?: AbortSignal,
  timeout: number = 15000
): Promise<UpdateApiKeyResponse> {
  const token = localStorage.getItem('access_token');
  
  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);
  
  try {
    const body: UpdateApiKeyRequest = { action };
    if (action === 'update') {
      body.api_key = apiKey;
      body.provider = provider;
      body.base_url = baseUrl;
    }
    
    const response = await fetch(`${API_BASE_URL}/user/apikey`, {
      method: 'POST',
      signal: signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '请求失败' }));
      throw new Error(error.detail || '请求失败');
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('服务器无响应，请检查网络连接');
    }
    throw error;
  }
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
 * @param signal - AbortSignal 用于取消请求
 * @param timeout - 超时时间（毫秒），默认 15000
 */
export async function register(
  inviteCode: string,
  email: string,
  username: string,
  password: string,
  apiKey: string,
  keyProvider: string,
  baseUrl: string,
  signal?: AbortSignal,
  timeout: number = 15000
): Promise<RegisterResponse> {
  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);
  
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      signal: signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invite_code: inviteCode,
        email,
        username,
        password,
        api_key: apiKey,
        key_provider: keyProvider,
        base_url: baseUrl,
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '请求失败' }));
      throw new Error(error.detail || '请求失败');
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('服务器无响应，请检查网络连接');
    }
    throw error;
  }
}
