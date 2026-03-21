import React, { useState, useCallback, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import { Prism, formatLanguageName, getActualLanguage } from '../lib/prism-config';

// 预定义的有效语言列表
const validLanguages = [
  'text', 'javascript', 'typescript', 'jsx', 'tsx',
  'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust',
  'bash', 'powershell', 'css', 'html', 'xml', 'json', 'yaml',
  'sql', 'markdown', 'lua', 'ruby', 'php', 'swift', 'kotlin',
  'scala', 'perl', 'r', 'graphql', 'protobuf', 'solidity',
  'docker', 'git', 'ini', 'toml', 'csv', 'diff', 'matlab',
  'apacheconf', 'regex', 'hcl', 'properties', 'makefile',
  // 常见别名
  'sh', 'zsh', 'shell', 'c++', 'cs', 'js', 'ts', 'py',
  'yml', 'oc', 'objc', 'objective-c', 'cli', 'console',
  'terminal', 'htm', 'svg', 'xhtml', 'md', 'tf',
];

// 代码块组件 - 使用 React.memo 优化
export const CodeBlock = React.memo(({ 
  className, 
  children,
}: { 
  className?: string; 
  children?: React.ReactNode;
}) => {
  const [isCopied, setIsCopied] = useState(false);
  
  // 从 className 中提取语言
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'text';
  const actualLanguage = getActualLanguage(language);
  
  // 检查是否是有效的语言
  const isValidLanguage = validLanguages.includes(language.toLowerCase());
  const displayLanguage = isValidLanguage ? formatLanguageName(actualLanguage) : 'Text';
  
  // 获取代码内容 - 直接从 children 提取，确保是纯文本
  const codeContent = useMemo(() => {
    // 递归提取所有文本内容，忽略所有 HTML/React 元素标签
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) return node.map(extractText).join('');
      if (React.isValidElement(node)) {
        return extractText((node.props as { children?: React.ReactNode }).children);
      }
      return '';
    };
    
    // 移除最后一个换行符，避免代码块后出现空行
    return extractText(children).replace(/\n$/, '');
  }, [children]);
  
  // 使用 Prism 高亮代码并添加行号（仅对有效语言）
  const highlightedLines = useMemo(() => {
    // 如果语言无效，直接渲染纯文本行
    if (!isValidLanguage) {
      const lines = codeContent.split('\n');
      return lines.map((line, index) => (
        <div 
          key={index} 
          className="flex items-stretch" 
          style={{ whiteSpace: 'pre', lineHeight: '1.5rem', height: '1.5rem' }}
        >
          <span 
            className="select-none text-right pr-3 text-zinc-600 text-xs flex items-center justify-end"
            style={{ minWidth: '2.5rem', fontFamily: 'monospace' }}
          >
            {index + 1}
          </span>
          <span className="flex-1 pl-2">{line}</span>
        </div>
      ));
    }
    
    // 递归渲染 token 内容的函数
    const renderTokenContent = (tokenContent: string | Prism.Token | (string | Prism.Token)[], index: number): React.ReactNode => {
      if (typeof tokenContent === 'string') {
        return tokenContent;
      }
      if (Array.isArray(tokenContent)) {
        return tokenContent.map((item, idx) => renderTokenContent(item, idx));
      }
      // 是 Token 对象
      const token = tokenContent as Prism.Token;
      // 支持复合 token 类型（如 function-variable），用空格分隔
      const tokenClass = token.type ? `token ${token.type}` : 'token';
      if (typeof token.content === 'string') {
        return (
          <span key={`${index}-token`} className={tokenClass}>
            {token.content}
          </span>
        );
      }
      // 嵌套的 token
      return (
        <span key={`${index}-token`} className={tokenClass}>
          {renderTokenContent(token.content, index)}
        </span>
      );
    };
    
    // 对整个代码块进行 tokenize，而不是逐行处理
    // 这样可以正确处理跨行的语法结构（如 Python 的三引号字符串）
    const grammar = Prism.languages[actualLanguage as keyof typeof Prism.languages];
    let allTokens: (string | Prism.Token)[] = [];
    
    if (grammar) {
      try {
        allTokens = Prism.tokenize(codeContent, grammar as Prism.Grammar) as (string | Prism.Token)[];
      } catch (e) {
        console.warn('Prism highlight error:', e);
      }
    }
    
    // 将 token 树按换行符分割成行，同时保留语法高亮结构
    const result: React.ReactNode[] = [];
    let currentLineTokens: (string | Prism.Token)[] = [];
    let lineNum = 1;
    
    const flushLine = () => {
      const renderedTokens = currentLineTokens.map((token, j) => renderTokenContent(token, j));
      result.push(
        <div key={lineNum} className="flex items-stretch" style={{ whiteSpace: 'pre', lineHeight: '1.5rem', height: '1.5rem' }}>
          <span 
            className="select-none text-right pr-3 text-zinc-600 text-xs flex items-center justify-end"
            style={{ minWidth: '2.5rem', fontFamily: 'monospace' }}
          >
            {lineNum}
          </span>
          <span className="flex-1 pl-2">{renderedTokens}</span>
        </div>
      );
      currentLineTokens = [];
      lineNum++;
    };
    
    const processToken = (token: string | Prism.Token) => {
      if (typeof token === 'string') {
        // 字符串可能包含换行符
        const parts = token.split('\n');
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].length > 0 || i < parts.length - 1) {
            currentLineTokens.push(parts[i]);
          }
          if (i < parts.length - 1) {
            // 遇到换行符，结束当前行
            flushLine();
          }
        }
      } else {
        // Token 对象，检查其内容是否包含换行
        if (typeof token.content === 'string') {
          const parts = token.content.split('\n');
          for (let i = 0; i < parts.length; i++) {
            // 始终添加 token，即使是空字符串（保留语法类型）
            currentLineTokens.push(new Prism.Token(token.type, parts[i], token.alias));
            if (i < parts.length - 1) {
              flushLine();
            }
          }
        } else if (Array.isArray(token.content)) {
          // 嵌套的 token
          token.content.forEach(processToken);
        }
      }
    };
    
    allTokens.forEach(processToken);
    flushLine();
    
    return result;
  }, [codeContent, actualLanguage, isValidLanguage]);
  
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  }, [codeContent]);
  
  // 直接返回代码块结构
  return (
    <div className="my-2 rounded-xl overflow-hidden border border-zinc-700/50 bg-zinc-800/80 shadow-lg">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-1 bg-zinc-800/80 border-b border-zinc-700/50">
        <span className="text-xs font-medium text-zinc-400">{displayLanguage}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-700/50 hover:bg-zinc-600/50 rounded-lg transition-colors"
        >
          {isCopied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400">已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
      
      {/* 代码内容 */}
      <div className="overflow-x-auto py-1">
        <div className="font-mono">
          <code className={`language-${actualLanguage} block`}>
            {highlightedLines}
          </code>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.children === nextProps.children && prevProps.className === nextProps.className;
});

// 行内代码组件 - 使用 React.memo 优化
export const InlineCode = React.memo(({ 
  children,
}: { 
  children?: React.ReactNode;
}) => {
  // 提取行内代码的文本内容
  const extractText = (node: React.ReactNode): string => {
    if (typeof node === 'string') {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(extractText).join('');
    }
    if (React.isValidElement(node)) {
      const childProps = node.props as { children?: React.ReactNode };
      return extractText(childProps.children);
    }
    return '';
  };
  
  const textContent = extractText(children);
  
  return (
    <code className="px-1.5 py-0.5 bg-zinc-700/80 text-orange-100/80 rounded-md font-mono border border-zinc-700/50">
      {textContent}
    </code>
  );
}, (prevProps, nextProps) => {
  return prevProps.children === nextProps.children;
});