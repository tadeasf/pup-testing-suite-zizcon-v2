import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  isAuthenticated: boolean;
  isSynced: boolean;
  lastSyncTimestamp: number | null;
  syncError: string | null;
  retryCount: number;
  maxRetries: number;
  // Actions
  setAuthenticated: (isAuthenticated: boolean) => void;
  setSynced: (isSynced: boolean) => void;
  setLastSyncTimestamp: (timestamp: number) => void;
  setSyncError: (error: string | null) => void;
  incrementRetry: () => void;
  resetRetries: () => void;
  // Computed
  shouldSync: () => boolean;
}

const SYNC_INTERVAL = 1000 * 60 * 60; // 1 hour

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      isSynced: false,
      lastSyncTimestamp: null,
      syncError: null,
      retryCount: 0,
      maxRetries: 3,

      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setSynced: (isSynced) => set({ isSynced }),
      setLastSyncTimestamp: (timestamp) => set({ lastSyncTimestamp: timestamp }),
      setSyncError: (error) => set({ syncError: error }),
      incrementRetry: () => set((state) => ({ retryCount: state.retryCount + 1 })),
      resetRetries: () => set({ retryCount: 0 }),

      shouldSync: () => {
        const state = get();
        if (!state.isAuthenticated) return false;
        if (!state.isSynced) return true;
        if (state.retryCount >= state.maxRetries) return false;
        if (!state.lastSyncTimestamp) return true;
        
        const timeSinceLastSync = Date.now() - state.lastSyncTimestamp;
        return timeSinceLastSync > SYNC_INTERVAL;
      }
    }),
    {
      name: 'auth-storage',
      skipHydration: true // Important for SSR
    }
  )
); 