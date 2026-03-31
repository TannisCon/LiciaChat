import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

//KaTeX 字体 preload CORS 修复
// import './lib/font-preload-patch'

import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
