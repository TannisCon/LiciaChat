import { Loader2 } from 'lucide-react';

export const ChatLoadingPlaceholder = () => {
  return (
    <div className="flex-1 flex items-center justify-center bg-zinc-900">
      <div className="text-center">
        <Loader2 className="w-16 h-16 mx-auto mb-4 text-blue-600 animate-spin" />
        <p className="text-zinc-400">加载对话中...</p>
      </div>
    </div>
  );
};