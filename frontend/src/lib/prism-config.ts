import Prism from 'prismjs';
import 'prism-themes/themes/prism-vsc-dark-plus.css';

// 导入语言支持（按正确顺序，先加载依赖）
// JSX/TSX 需要 javascript 和 markup 作为依赖
import 'prismjs/components/prism-markup'; // HTML/XML - 必须在 JSX 之前加载
import 'prismjs/components/prism-javascript'; // JSX 依赖
import 'prismjs/components/prism-jsx'; // JSX
import 'prismjs/components/prism-typescript'; // TSX 依赖
import 'prismjs/components/prism-tsx'; // TSX

// 其他语言
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-ini';
import 'prismjs/components/prism-properties';
import 'prismjs/components/prism-makefile';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-git';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-protobuf';
import 'prismjs/components/prism-regex';
import 'prismjs/components/prism-solidity';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-perl';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-csv';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-matlab';
import 'prismjs/components/prism-apacheconf';

// 语言别名映射
export const languageAliasMap: Record<string, string> = {
  'sh': 'bash',
  'zsh': 'bash',
  'shell': 'bash',
  'c++': 'cpp',
  'cs': 'csharp',
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'yml': 'yaml',
  'oc': 'objectivec',
  'objc': 'objectivec',
  'objective-c': 'objectivec',
  'cli': 'bash',
  'console': 'bash',
  'terminal': 'bash',
  'htm': 'html',
  'svg': 'xml',
  'xhtml': 'html',
  'md': 'markdown',
  'tsv': 'csv',
  'conf': 'ini',
  'config': 'ini',
  'dockerfile': 'docker',
  'tf': 'hcl',
  'hcl': 'hcl',
  'toml': 'toml',
  'csv': 'csv',
  'diff': 'diff',
  'matlab': 'matlab',
  'apacheconf': 'apacheconf',
};

// 格式化语言名称（首字母大写）
export function formatLanguageName(lang: string): string {
  if (!lang) return 'Code';
  const langNameMap: Record<string, string> = {
    'bash': 'Bash',
    'c': 'C',
    'cpp': 'C++',
    'csharp': 'C#',
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'jsx': 'React JSX',
    'tsx': 'React TSX',
    'python': 'Python',
    'yaml': 'YAML',
    'json': 'JSON',
    'xml': 'XML',
    'html': 'HTML',
    'css': 'CSS',
    'sql': 'SQL',
    'markdown': 'Markdown',
    'go': 'Go',
    'rust': 'Rust',
    'java': 'Java',
    'lua': 'Lua',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'scala': 'Scala',
    'ruby': 'Ruby',
    'php': 'PHP',
    'perl': 'Perl',
    'r': 'R',
    'powershell': 'PowerShell',
    'docker': 'Docker',
    'git': 'Git',
    'graphql': 'GraphQL',
    'protobuf': 'Protobuf',
    'solidity': 'Solidity',
    'hcl': 'HCL',
    'ini': 'INI',
    'toml': 'TOML',
    'csv': 'CSV',
    'diff': 'Diff',
    'matlab': 'MATLAB',
    'apacheconf': 'Apache Conf',
  };
  return langNameMap[lang.toLowerCase()] || lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
}

// 获取实际的语言名称
export function getActualLanguage(lang: string): string {
  const lowerLang = lang.toLowerCase();
  return languageAliasMap[lowerLang] || lowerLang;
}

// 注入自定义 CSS 覆盖 prism-themes 的伪元素反引号样式
export function injectPrismOverride(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('prism-custom-override')) return;

  const customStyle = document.createElement('style');
  customStyle.id = 'prism-custom-override';
  customStyle.textContent = `
    /* 隐藏 prism-themes 在 code 元素上添加的伪元素反引号 */
    code[class*="language-"]::before,
    code[class*="language-"]::after,
    pre[class*="language-"] code::before,
    pre[class*="language-"] code::after {
      content: none !important;
      display: none !important;
    }
    
    /* 隐藏所有 code 元素的伪元素反引号（包括行内代码） */
    code::before,
    code::after {
      content: none !important;
      display: none !important;
    }
    
    /* 修复代码缩进 - 保留空白字符 */
    .table-cell.pl-2 {
      white-space: pre !important;
    }
    
    /* 确保 code 元素内容可见 */
    code[class*="language-"],
    pre[class*="language-"] {
      color: #abb2bf !important;  /* One Dark 默认文本颜色 */
      text-shadow: none !important;
      background: transparent !important;
    }
    

  `;
  document.head.appendChild(customStyle);
}

// 自动注入 CSS
injectPrismOverride();

export { Prism };