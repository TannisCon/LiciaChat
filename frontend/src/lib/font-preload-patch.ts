//KaTeX 字体 preload CORS 修复（保险版，仅影响 KaTeX）
// 事实证明还是没用，不知道katex字体怎么加载的，运行时修复也没用，可能是因为它们被内联到 JS 里了，无法通过 DOM 操作修复（只能在生成阶段修复，但我没找到合适的插件接口）。
// 先保留这个文件，等以后有空再研究一下，先忽略浏览器的 CORS 报错，反正字体是能加载上的。
/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof document !== 'undefined') {
  const originalCreateElement = document.createElement.bind(document);

  document.createElement = function (tagName: string, options?: any) {
    const el = originalCreateElement(tagName, options);

    if (tagName.toLowerCase() === 'link') {
      const link = el as HTMLLinkElement;

      const fixCrossOrigin = () => {
        if (
          link.rel === 'preload' &&
          link.as === 'font' &&
          link.href &&
          /katex/i.test(link.href) && // 仅 KaTeX 字体
          !link.crossOrigin
        ) {
          link.crossOrigin = 'anonymous';
          console.log(`[KaTeX Font Fix] Applied crossorigin to: ${link.href}`);
        }
      };

      // 拦截 setAttribute
      const originalSetAttribute = link.setAttribute.bind(link);
      link.setAttribute = function (name: string, value: any) {
        const result = originalSetAttribute(name, value);
        if (/^(rel|as|href)$/i.test(name)) setTimeout(fixCrossOrigin, 0);
        return result;
      };

      // 拦截直接赋值
      ['rel', 'as', 'href'].forEach((prop) => {
        let _val = (link as any)[prop];
        Object.defineProperty(link, prop, {
          get() { return _val; },
          set(v) { _val = v; setTimeout(fixCrossOrigin, 0); },
          configurable: true,
          enumerable: true,
        });
      });

      // 初始检查
      setTimeout(fixCrossOrigin, 0);
    }

    return el;
  };
}
