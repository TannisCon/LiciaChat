const API_BASE_URL = '/api';

// 邀请码信息接口
export interface InviteCodeItem {
  code: string;
  user_id: string;
  type: string;
  created_at: string;
  used_by: string[];
  used_at: string[];
  uses: number;
  max_uses: number;
  expires_at: string | null;
  note: string | null;
}

// 创建邀请码请求
export interface CreateInviteCodeRequest {
  type: string;
  expires_days: number;
  max_uses: number;
  note?: string;
}

// 创建邀请码响应
export interface CreateInviteCodeResponse {
  code: string;
}

// 获取邀请码列表响应
export interface GetInviteCodesResponse {
  codes: InviteCodeItem[];
}

// 删除邀请码响应
export interface DeleteInviteCodeResponse {
  message: string;
}

/**
 * 创建邀请码
 * @param data 创建邀请码的请求数据
 * @param signal AbortSignal 用于超时控制
 */
export async function createInviteCode(
  data: CreateInviteCodeRequest,
  signal?: AbortSignal
): Promise<CreateInviteCodeResponse> {
  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 5000); // 5 秒超时

  const token = localStorage.getItem('access_token');

  try {
    const response = await fetch(`${API_BASE_URL}/user/invite`, {
      method: 'POST',
      signal: signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
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

/**
 * 获取邀请码列表
 * @param signal AbortSignal 用于超时控制
 */
export async function getInviteCodes(signal?: AbortSignal): Promise<GetInviteCodesResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 5000); // 5 秒超时

  const token = localStorage.getItem('access_token');

  try {
    const response = await fetch(`${API_BASE_URL}/user/invite`, {
      method: 'GET',
      signal: signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
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

/**
 * 删除邀请码
 * @param code 邀请码
 * @param signal AbortSignal 用于超时控制
 */
export async function deleteInviteCode(
  code: string,
  signal?: AbortSignal
): Promise<DeleteInviteCodeResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 5000); // 5 秒超时

  const token = localStorage.getItem('access_token');

  try {
    const response = await fetch(`${API_BASE_URL}/user/invite/${code}`, {
      method: 'DELETE',
      signal: signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
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
