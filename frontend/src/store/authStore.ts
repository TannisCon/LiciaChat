import { create } from 'zustand';

export interface UserInfo {
  uid: number;
  uuid: string;
  email: string;
  username: string;
  role: string;
  created_at: string;
}

interface AuthState {
  // 认证状态
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserInfo | null;
  accessToken: string | null;
  refreshRetryCount: number;
  
  // Actions
  setAuthenticated: (authenticated: boolean) => void;
  setUser: (user: UserInfo | null) => void;
  setAccessToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  incrementRefreshRetry: () => void;
  resetRefreshRetry: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  // 初始状态
  isAuthenticated: false,
  isLoading: true, // 初始加载状态，等待检查 cookie
  user: null,
  accessToken: null,
  refreshRetryCount: 0,
  
  // Actions
  setAuthenticated: (authenticated) => set({ isAuthenticated: authenticated }),
  setUser: (user) => set({ user }),
  setAccessToken: (token) => set({ accessToken: token }),
  setLoading: (loading) => set({ isLoading: loading }),
  incrementRefreshRetry: () => set((state) => ({ refreshRetryCount: state.refreshRetryCount + 1 })),
  resetRefreshRetry: () => set({ refreshRetryCount: 0 }),
  logout: () => set({
    isAuthenticated: false,
    user: null,
    accessToken: null,
    refreshRetryCount: 0,
  }),
}));