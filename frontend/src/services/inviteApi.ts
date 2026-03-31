import { authClient } from './apiClient';

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
 * @param _signal AbortSignal 用于超时控制（暂不使用）
 */

export async function createInviteCode(
  data: CreateInviteCodeRequest,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _signal?: AbortSignal
): Promise<CreateInviteCodeResponse> {
  const response = await authClient.post<CreateInviteCodeResponse>('/user/invite', data);
  return response.data;
}

/**
 * 获取邀请码列表
 * @param _signal AbortSignal 用于超时控制（暂不使用）
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getInviteCodes(_signal?: AbortSignal): Promise<GetInviteCodesResponse> {
  const response = await authClient.get<GetInviteCodesResponse>('/user/invite');
  return response.data;
}

/**
 * 删除邀请码
 * @param code 邀请码
 * @param _signal AbortSignal 用于超时控制（暂不使用）
 */
export async function deleteInviteCode(
  code: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _signal?: AbortSignal
): Promise<DeleteInviteCodeResponse> {
  const response = await authClient.delete<DeleteInviteCodeResponse>(`/user/invite/${code}`);
  return response.data;
}