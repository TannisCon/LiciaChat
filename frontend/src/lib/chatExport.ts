import { getChatHistory } from '../services/chatApi';

/**
 * 导出的对话数据结构
 */
export interface ExportedChat {
  chat_id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  history: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
  }>;
  exported_at: string;
}

/**
 * 获取对话历史并生成导出数据
 */
export async function fetchChatForExport(chatId: string): Promise<ExportedChat> {
  const response = await getChatHistory(chatId);
  
  return {
    chat_id: response.chat_id,
    title: response.title,
    history: response.history.map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    exported_at: new Date().toISOString(),
  };
}

/**
 * 生成文件名（格式：Licia-History-YYYY-MM-DD-HH-MM-SS.json）
 */
export function generateExportFilename(title: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `Licia-History-${title}-${year}${month}${day}${hours}${minutes}${seconds}.json`;
}

/**
 * 触发浏览器下载 JSON 文件
 */
export function downloadJson(data: ExportedChat, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // 释放 URL 对象
  URL.revokeObjectURL(url);
}

/**
 * 导出对话的完整流程
 */
export async function exportChat(chatId: string): Promise<void> {
  const chatData = await fetchChatForExport(chatId);
  const filename = generateExportFilename(chatData.title);
  downloadJson(chatData, filename);
}