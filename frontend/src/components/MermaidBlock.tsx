import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Copy, Check, Eye, Code2, ZoomIn, ZoomOut, Move, RotateCcw, Hand, GitGraph } from 'lucide-react';

interface MermaidBlockProps {
  children?: React.ReactNode;
}

// 提取文本内容的辅助函数
const extractText = (node: React.ReactNode): string => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
};

// 模块级变量，追踪 mermaid 是否已初始化
let mermaidInitialized = false;

// 设置 mermaid 已初始化的函数
const setMermaidInitialized = () => {
  mermaidInitialized = true;
};

export const MermaidBlock = React.memo(({ children }: MermaidBlockProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const [showSource, setShowSource] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [hasError, setHasError] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  
  // 平移状态
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [panMode, setPanMode] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });
  
  // 获取 mermaid 代码内容
  const codeContent = extractText(children);
  
  // 渲染 mermaid 图表
  useEffect(() => {
    let mounted = true;
    
    // 清理 mermaid 临时元素的辅助函数
    const cleanupMermaidTempElement = (id: string) => {
      // mermaid 会创建 id 为 d{originalId} 的临时 div
      const tempDiv = document.getElementById(`d${id}`);
      if (tempDiv) {
        tempDiv.remove();
      }
    };
    
    const renderMermaid = async () => {
      if (!codeContent.trim() || showSource) {
        return;
      }
      
      try {
        // 动态导入 mermaid，避免 SSR 问题
        const mermaid = (await import('mermaid')).default;
        
        // 初始化 mermaid（只初始化一次）
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'loose',
            themeVariables: {
              background: '#18181b',
              primaryColor: '#27272a',
              secondaryColor: '#3f3f46',
              tertiaryColor: '#52525b',
              primaryTextColor: '#e4e4e7',
              secondaryTextColor: '#a1a1aa',
              lineColor: '#71717a',
              fontSize: '14px',
            },
            flowchart: {
              useMaxWidth: false,
              htmlLabels: true,
              curve: 'basis',
            },
            sequence: {
              useMaxWidth: false,
            },
            gantt: {
              useMaxWidth: false,
            },
          });
          setMermaidInitialized();
        }
        
        // 生成唯一 ID
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // 验证并渲染
        const { svg } = await mermaid.render(id, codeContent);
        
        if (mounted && containerRef.current) {
          containerRef.current.innerHTML = svg;
          svgRef.current = containerRef.current.querySelector('svg');
          setIsRendered(true);
          setHasError(false);
          // 重置平移和缩放
          setPanX(0);
          setPanY(0);
          setZoom(1);
          
          // 渲染成功后清理临时元素
          cleanupMermaidTempElement(id);
        }
      } catch (error) {
        console.error('Mermaid 渲染失败:', error);
        if (mounted) {
          setHasError(true);
          setIsRendered(false);
        }
      }
      
      // 无论成功还是失败，都尝试清理可能残留的临时元素
      // 使用一个通用的选择器来清理所有 mermaid 临时元素
      const mermaidTempElements = document.querySelectorAll('[id^="dmermaid-"]');
      mermaidTempElements.forEach(el => el.remove());
    };
    
    renderMermaid();
    
    return () => {
      mounted = false;
    };
  }, [codeContent, showSource]);
  
  // 复制代码
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  }, [codeContent]);
  
  // 切换源码视图
  const handleToggleSource = useCallback(() => {
    setShowSource(!showSource);
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, [showSource]);

  // 重置视图
  const handleReset = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  // 切换平移模式
  const handleTogglePanMode = useCallback(() => {
    setPanMode(prev => !prev);
  }, []);

  // 平移处理 - 鼠标事件
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 只有在平移模式或按住 Alt 键时才启动拖拽
    if (!panMode && !e.altKey) return;
    e.preventDefault();
    setIsDragging(true);
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  }, [panMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    setPanX(prev => prev + dx);
    setPanY(prev => prev + dy);
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 缩放控制
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  }, []);
  
  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  }, []);
  
  // 下载 SVG
  const handleDownload = useCallback(() => {
    if (!svgRef.current) return;
    
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mermaid-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);
  
  return (
    <div className="my-2 rounded-xl overflow-hidden border border-zinc-700/50 bg-zinc-800/80 shadow-lg">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-1 bg-zinc-800/80 border-b border-zinc-700/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-cyan-600 flex items-center gap-1">
            <GitGraph className="w-3.5 h-3.5" />
            Mermaid
          </span>
          {isRendered && !showSource && (
            <span className="text-xs text-zinc-500">• 已渲染</span>
          )}
          {hasError && (
            <span className="text-xs text-red-400">• 渲染失败</span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          {/* 查看源码/图表切换 */}
          <button
            onClick={handleToggleSource}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-700/50 hover:bg-zinc-600/50 rounded-lg transition-colors"
            title={showSource ? '查看图表' : '查看源码'}
          >
            {showSource ? (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>查看图表</span>
              </>
            ) : (
              <>
                <Code2 className="w-3.5 h-3.5" />
                <span>查看源码</span>
              </>
            )}
          </button>
          
          {/* 复制按钮 */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-700/50 hover:bg-zinc-600/50 rounded-lg transition-colors"
            title={isCopied ? '已复制' : '复制'}
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
          
          {/* 缩放控制（仅在图表模式下显示） */}
          {!showSource && isRendered && (
            <>
              {/* 平移模式切换 */}
              <button
                onClick={handleTogglePanMode}
                className={`p-1.5 rounded-lg transition-colors ${
                  panMode 
                    ? 'text-blue-400 bg-blue-600/30 hover:bg-blue-600/40' 
                    : 'text-zinc-400 hover:text-zinc-200 bg-zinc-700/50 hover:bg-zinc-600/50'
                }`}
                title={panMode ? '平移模式已开启 (拖拽移动)' : '平移模式已关闭 (点击开启)'}
              >
                {panMode ? <Hand className="w-3.5 h-3.5" /> : <Move className="w-3.5 h-3.5" />}
              </button>
              
              <button
                onClick={handleZoomOut}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-700/50 hover:bg-zinc-600/50 rounded-lg transition-colors"
                title="缩小"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleZoomIn}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-700/50 hover:bg-zinc-600/50 rounded-lg transition-colors"
                title="放大"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleReset}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-700/50 hover:bg-zinc-600/50 rounded-lg transition-colors"
                title="重置视图"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleDownload}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-700/50 hover:bg-zinc-600/50 rounded-lg transition-colors"
                title="下载 SVG"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* 内容区域 */}
      <div 
        className="overflow-hidden py-1 bg-zinc-800/50"
        style={{ cursor: panMode ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {showSource ? (
          <pre className="my-0 p-4 text-sm text-zinc-300 font-mono whitespace-pre-wrap break-words bg-zinc-800/80">
            {codeContent}
          </pre>
        ) : hasError ? (
          <div className="p-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-sm font-medium mb-2">Mermaid 渲染失败</p>
              <p className="text-red-400/70 text-xs">请检查语法是否正确</p>
              <pre className="mt-3 p-3 bg-zinc-900/50 rounded border border-zinc-700/50 text-xs text-zinc-400 overflow-x-auto whitespace-pre-wrap break-words">
                {codeContent}
              </pre>
              <button
                onClick={handleToggleSource}
                className="mt-3 px-3 py-1.5 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors"
              >
                回到查看源码
              </button>
            </div>
          </div>
        ) : (
          <div 
            ref={contentRef}
            className="relative w-full h-full min-h-[300px] flex items-center justify-center"
          >
            <div 
              className="origin-center"
              style={{ 
                transform: 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoom + ')',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              }}
            >
              <div ref={containerRef} className="mermaid" />
            </div>
          </div>
        )}
      </div>
      
      {!showSource && isRendered && (
        <div className="px-4 py-1 bg-zinc-800/50 border-t border-zinc-700/50 text-xs text-zinc-500 flex items-center justify-between">
          <span>缩放：{Math.round(zoom * 100)}%</span>
          <span>位置：({panX}, {panY})</span>
          <span className="text-zinc-600">Alt+ 拖拽或开启平移模式移动</span>
        </div>
      )}
      
      {!showSource && isRendered && panMode && (
        <div className="px-4 py-1 bg-blue-600/20 border-t border-blue-500/30 text-xs text-blue-400 text-center">
          平移模式已开启 - 拖拽图表移动
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.children === nextProps.children;
});