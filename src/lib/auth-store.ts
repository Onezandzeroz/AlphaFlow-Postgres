import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { logger } from '@/lib/logger';

export interface User {
  id: string;
  email: string;
  emailVerified?: boolean;
  businessName?: string | null;
  demoModeEnabled?: boolean;
  isDemoCompany?: boolean;
  isSuperDev?: boolean;
  hasAppOwner?: boolean;
  activeCompanyId?: string | null;
  activeCompanyRole?: string | null;
  activeCompanyName?: string | null;
  companies?: CompanyInfo[];
  oversightCompanyId?: string | null;
  oversightCompanyName?: string | null;
  isOversightMode?: boolean;
}

export interface CompanyInfo {
  id: string;
  name: string;
  role: string;
  isDemo: boolean;
  isActive: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
  switchCompany: (companyId: string) => Promise<void>;
  startOversight: (companyId: string) => Promise<void>;
  stopOversight: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      setUser: (user) => set({ user, isLoading: false }),
      setLoading: (loading) => set({ isLoading: loading }),
      logout: () => {
        set({ user: null, isLoading: false });
        // Call logout API
        if (typeof window !== 'undefined') {
          fetch('/api/auth/logout', { method: 'POST' });
        }
      },
      checkAuth: async () => {
        try {
          const response = await fetch('/api/auth/me');
          const data = await response.json();
          
          if (data.user) {
            set({ user: data.user, isLoading: false });
          } else {
            set({ user: null, isLoading: false });
          }
        } catch (error) {
          logger.error('Auth check failed:', error);
          set({ user: null, isLoading: false });
        }
      },
      switchCompany: async (companyId: string) => {
        try {
          const response = await fetch('/api/company/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId }),
          });

          if (response.ok) {
            const data = await response.json();
            // Update user state with new active company
            const currentUser = get().user;
            if (currentUser) {
              set({
                user: {
                  ...currentUser,
                  activeCompanyId: data.companyId,
                  activeCompanyName: data.companyName,
                  activeCompanyRole: data.role,
                  isDemoCompany: data.isDemoCompany ?? false,
                },
              });
            }
            // Reload page to refresh all data for new company context
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }
        } catch (error) {
          logger.error('Switch company failed:', error);
        }
      },
      startOversight: async (companyId: string) => {
        try {
          const response = await fetch('/api/oversight/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId }),
          });

          if (response.ok) {
            const data = await response.json();
            const currentUser = get().user;
            if (currentUser) {
              set({
                user: {
                  ...currentUser,
                  oversightCompanyId: data.oversightCompanyId,
                  oversightCompanyName: data.oversightCompanyName,
                  isOversightMode: true,
                },
              });
            }
            // Reload to refresh all data with oversight tenant scoping
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          } else {
            const data = await response.json();
            logger.error('Start oversight failed:', data.error);
            throw new Error(data.error || 'Failed to start oversight');
          }
        } catch (error) {
          logger.error('Start oversight failed:', error);
          throw error;
        }
      },
      stopOversight: async () => {
        try {
          const response = await fetch('/api/oversight/clear', {
            method: 'POST',
          });

          if (response.ok) {
            const currentUser = get().user;
            if (currentUser) {
              set({
                user: {
                  ...currentUser,
                  oversightCompanyId: null,
                  oversightCompanyName: null,
                  isOversightMode: false,
                },
              });
            }
            // Reload to return to normal data scoping
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }
        } catch (error) {
          logger.error('Stop oversight failed:', error);
        }
      },
    }),
    {
      name: 'danish-bookkeeping-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
    }
  )
);
