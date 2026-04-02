import { authClient, modelsClient } from './apiClient';

// 模型接口（OpenAI 标准格式）
export interface Model {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  capabilities?: string[];
}

// 模型列表响应
export interface ModelListResponse {
  object: 'list';
  data: Model[];
}

// 更新对话模型请求
export interface UpdateChatModelRequest {
  current_model: string;
}

// 更新对话模型响应
export interface UpdateChatModelResponse {
  chat_id: string;
  current_model: string;
}

// 对话信息接口
// 注意：created_at 和 updated_at 是后端返回的 UNIX 秒级时间戳（UTC）
export interface ChatSession {
  chat_id: string;
  title: string;
  created_at: number;  // UNIX 秒级时间戳
  updated_at: number;  // UNIX 秒级时间戳
}

// 创建对话响应
export interface CreateChatResponse {
  chat_id: string;
  title: string;
  created_at: number;  // UNIX 秒级时间戳
}

// 对话列表响应
export interface ChatListResponse {
  chats: ChatSession[];
}

// 删除对话响应
export interface DeleteChatResponse {
  message: string;
  chat_id: string;
}

// 更新标题请求
export interface UpdateTitleRequest {
  title: string;
}

// 更新标题响应
export interface UpdateTitleResponse {
  chat_id: string;
  title: string;
}

// 对话历史消息接口
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// 对话历史响应
export interface ChatHistoryResponse {
  chat_id: string;
  title: string;
  current_model: string;
  history: HistoryMessage[];
}

/**
 * 获取对话列表
 */
export async function getChatList(): Promise<ChatListResponse> {
  const response = await authClient.get<ChatListResponse>('/chat');
  return response.data;
}

/**
 * 创建新对话
 * 注意：传递空对象 {} 作为 data 参数，确保 axios 设置 Content-Type: application/json 头
 * （CDN 要求 POST 请求必须包含此头）
 */
export async function createChat(): Promise<CreateChatResponse> {
  const response = await authClient.post<CreateChatResponse>('/chat', {});
  return response.data;
}

/**
 * 删除对话
 */
export async function deleteChat(chatId: string): Promise<DeleteChatResponse> {
  const response = await authClient.delete<DeleteChatResponse>(`/chat/${chatId}`);
  return response.data;
}

/**
 * 更新对话标题
 */
export async function updateChatTitle(
  chatId: string,
  title: string
): Promise<UpdateTitleResponse> {
  const response = await authClient.patch<UpdateTitleResponse>(`/chat/${chatId}`, {
    title,
  });
  return response.data;
}

/**
 * 获取对话历史
 */
export async function getChatHistory(chatId: string): Promise<ChatHistoryResponse> {
  const response = await authClient.get<ChatHistoryResponse>(`/chat/${chatId}`);
  return response.data;
}

/**
 * 获取可用模型列表
 * 使用 modelsClient（v1/models 没有/api/前缀）
 *
 * 注意：重试逻辑应在调用方（如 store）中处理，避免重复请求
 */
export async function getModels(): Promise<ModelListResponse> {
  const response = await modelsClient.get<ModelListResponse>('v1/models');
  return response.data;
}

/**
 * 更新对话的当前模型
 */
export async function updateChatModel(
  chatId: string,
  modelId: string
): Promise<UpdateChatModelResponse> {
  const response = await authClient.patch<UpdateChatModelResponse>(`/chat/${chatId}`, {
    current_model: modelId,
  });
  return response.data;
}

// 流式对话请求参数
export interface ChatCompletionsRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  enable_thinking?: boolean;
}

// 流式响应 chunk 接口
export interface ChatChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      reasoning_content?: string;
    };
    finish_reason: string | null;
  }[];
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

// 错误响应接口
export interface ChatError {
  error: {
    message: string;
    type: string;
  };
}

/**
 * 流式对话 API
 * 注意：此函数继续使用原生 fetch，因为 SSE 流式传输不适合用 axios 处理
 */
export async function streamChatCompletions(
  chatId: string,
  request: ChatCompletionsRequest,
  signal: AbortSignal
): Promise<AsyncGenerator<ChatChunk | ChatError, void, unknown>> {
  const token = localStorage.getItem('access_token');

  const response = await fetch(`/api/chat/${chatId}/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: request.messages,
      enable_thinking: request.enable_thinking,
    }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { message: '请求失败', type: 'http_error' } }));
    throw new Error(error.error?.message || '请求失败');
  }

  const reader = response.body!.getReader();

  const decoder = new TextDecoder();
  let buffer = '';

  // 创建异步生成器
  async function* generate() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 格式的数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后不完整的一行

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6);
            if (data === '[DONE]') {
              continue;
            }
            try {
              const chunk: ChatChunk | ChatError = JSON.parse(data);
              yield chunk;
            } catch (e) {
              console.error('解析 chunk 失败:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  return generate();
}