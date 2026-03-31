import { Suspense, lazy, useEffect } from 'react';
import Layout from './components/Layout';
import { ChatLoadingPlaceholder } from './components/ChatLoadingPlaceholder';

const ChatPage = lazy(() => import('./pages/ChatPage'));

function App() {
  // 预加载 ChatPage 模块，确保 lazy() 能正常 resolve
  useEffect(() => {
    import('./pages/ChatPage').catch(console.error);
  }, []);

  return (
    <Layout>
      <Suspense fallback={<ChatLoadingPlaceholder />}>
        <ChatPage />
      </Suspense>
    </Layout>
  );
}

export default App;
