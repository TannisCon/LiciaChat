import React from 'react';
import { CodeBlock, InlineCode } from './CodeBlock';

// 提取文本内容的辅助函数
const extractText = (node: React.ReactNode): string => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
};

// ReactMarkdown components 配置
export const markdownComponents = {
  // 标题组件 - 自定义边距
  h1: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-2xl font-bold mt-3 mb-2 text-zinc-100/90">
      {children}
    </h1>
  ),
  h2: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-xl font-semibold mt-2 mb-2 text-zinc-100/90">
      {children}
    </h2>
  ),
  h3: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-lg font-mediumbold mt-2 mb-1 text-zinc-100/90">
      {children}
    </h3>
  ),
  h4: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4 className="text-base font-medium mt-2 mb-1 text-zinc-100/90">
      {children}
    </h4>
  ),
  h5: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h5 className="text-sm font-medium mt-2 mb-1 text-zinc-100/90">
      {children}
    </h5>
  ),
  h6: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h6 className="text-sm font-medium mt-2 mb-1 text-zinc-100/90">
      {children}
    </h6>
  ),
  // pre 组件直接处理代码块
  pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => {
    // 从 children 中提取 code 元素的信息
    const codeElement = React.Children.toArray(children).find(
      (child) => React.isValidElement(child) && child.type === 'code'
    ) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined;
    
    if (codeElement) {
      // 使用 CodeBlock 渲染所有 pre > code 结构（CodeBlock 内部会处理无效语言）
      return <CodeBlock className={codeElement.props.className || ''}>{codeElement.props.children}</CodeBlock>;
    }
    // 没有 code 元素，返回原始内容
    return <>{children}</>;
  },
  code: ({ children, className }: React.HTMLAttributes<HTMLElement>) => {
    // 检查是否有 language 类名，如果有说明是代码块中的 code，应该已经被 pre 处理了
    const match = /language-(\w+)/.exec(className || '');
    if (match) {
      // 这是代码块中的 code，但 pre 没有被调用（异常情况），使用 CodeBlock 渲染
      return <CodeBlock className={className}>{children}</CodeBlock>;
    }
    
    // 鲁棒性检查：如果内容包含多行（有换行符），说明可能是未闭合的代码块
    // 这种情况下不应该渲染为行内代码，而是返回原始内容
    const textContent = extractText(children);
    const lines = textContent.split('\n');
    
    // 如果内容超过一定行数（比如 3 行），认为是未闭合的代码块，返回原始文本
    if (lines.length > 3) {
      // 返回纯文本，不换行内代码样式
      return <span className="whitespace-pre-wrap">{textContent}</span>;
    }
    
    // 行内代码
    return <InlineCode>{children}</InlineCode>;
  },
  // 表格组件 - 添加宽度约束防止溢出
  table: ({ children }: React.HTMLAttributes<HTMLTableElement>) => {
    return (
      <div className="w-full overflow-x-auto my-2 py-2">
        <table className="min-w-0 table-auto border-collapse text-sm my-0 py-0">
          {children}
        </table>
      </div>
    );
  },
  thead: ({ children }: React.HTMLAttributes<HTMLTableSectionElement>) => {
    return <thead className="bg-zinc-700/50">{children}</thead>;
  },
  tbody: ({ children }: React.HTMLAttributes<HTMLTableSectionElement>) => {
    return <tbody className="divide-y divide-zinc-700/50">{children}</tbody>;
  },
  tr: ({ children }: React.HTMLAttributes<HTMLTableRowElement>) => {
    return <tr className="hover:bg-zinc-700/30 transition-colors">{children}</tr>;
  },
  th: ({ children }: React.HTMLAttributes<HTMLTableHeaderCellElement>) => {
    return (
      <th className="px-3 py-1 text-left text-zinc-200 font-medium border border-zinc-700/50 whitespace-normal break-words max-w-xs">
        {children}
      </th>
    );
  },
  td: ({ children }: React.HTMLAttributes<HTMLTableCellElement>) => {
    return (
      <td className="px-3 py-1 text-zinc-300 border border-zinc-700/50 whitespace-normal break-words max-w-xs">
        {children}
      </td>
    );
  },
  // 超链接组件 - 默认在新标签页打开
  a: ({ children, href }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan-400/80 hover:text-cyan-300/90 underline break-all"
      >
        {children}
      </a>
    );
  },
};