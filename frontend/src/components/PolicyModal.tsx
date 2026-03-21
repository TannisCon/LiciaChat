import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  policyType: 'terms' | 'privacy';
}

const PolicyModal: React.FC<PolicyModalProps> = ({ isOpen, onClose, policyType }) => {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // 加载协议内容
  useEffect(() => {
    if (!isOpen) return;
    
    const loadPolicy = async () => {
      setIsLoading(true);
      setError('');
      
      const fileName = policyType === 'terms' ? 'terms-of-service.md' : 'privacy-policy.md';
      
      try {
        const response = await fetch(`/${fileName}`);
        if (!response.ok) {
          throw new Error('无法加载协议内容');
        }
        const text = await response.text();
        setContent(text);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
        setIsLoading(false);
      }
    };
    
    loadPolicy();
  }, [isOpen, policyType]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 协议窗口 */}
      <div className="relative bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 border border-zinc-700 max-h-[80vh] flex flex-col">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 标题栏 */}
        <div className="p-6 border-b border-zinc-700">
          <h2 className="text-xl font-bold text-zinc-100">
            {policyType === 'terms' ? '用户协议' : '隐私政策'}
          </h2>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-zinc-400">加载中...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-400">{error}</div>
            </div>
          ) : (
            <div className="prose prose-invert prose-zinc max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: (props) => <h1 className="text-2xl font-bold text-zinc-100 mt-6 mb-4" {...props} />,
                  h2: (props) => <h2 className="text-xl font-bold text-zinc-100 mt-5 mb-3" {...props} />,
                  h3: (props) => <h3 className="text-lg font-bold text-zinc-100 mt-4 mb-2" {...props} />,
                  p: (props) => <p className="text-zinc-300 leading-relaxed mb-4" {...props} />,
                  ul: (props) => <ul className="list-disc list-inside text-zinc-300 mb-4 space-y-1" {...props} />,
                  ol: (props) => <ol className="list-decimal list-inside text-zinc-300 mb-4 space-y-1" {...props} />,
                  li: (props) => <li className="text-zinc-300" {...props} />,
                  a: (props) => <a className="text-blue-400 underline hover:text-blue-300" target="_blank" rel="noopener noreferrer" {...props} />,
                  blockquote: (props) => <blockquote className="border-l-4 border-zinc-600 pl-4 text-zinc-400 italic" {...props} />,
                  code: (props) => {
                    const { children, ...rest } = props;
                    const className = rest.className as string | undefined;
                    const isInline = !className || !className.includes('language-');
                    return isInline
                      ? <code className="bg-zinc-700 px-2 py-1 rounded text-zinc-300 text-sm" {...rest}>{children}</code>
                      : <code className="block bg-zinc-700 p-4 rounded-xl text-zinc-300 text-sm overflow-x-auto" {...rest}>{children}</code>;
                  },
                  strong: (props) => <strong className="font-bold text-zinc-100" {...props} />,
                  em: (props) => <em className="italic text-zinc-400" {...props} />,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="p-6 border-t border-zinc-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-xl transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default PolicyModal;