import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type SidebarSectionId =
  | 'daily-operations'
  | 'bookkeeping'
  | 'reporting'
  | 'compliance'
  | 'maintenance';

export interface SidebarPreferences {
  expandedSections: SidebarSectionId[];
}

interface SidebarState {
  expandedSections: SidebarSectionId[];
  searchQuery: string;
  isSyncing: boolean;

  // Actions
  toggleSection: (sectionId: SidebarSectionId) => void;
  setSearchQuery: (query: string) => void;
  setExpandedSections: (sections: SidebarSectionId[]) => void;
  syncFromServer: (preferences: SidebarPreferences) => void;
  setSyncing: (syncing: boolean) => void;
}

const DEFAULT_EXPANDED: SidebarSectionId[] = ['daily-operations'];

const STORAGE_KEY = 'alphaai-sidebar-prefs';

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      expandedSections: DEFAULT_EXPANDED,
      searchQuery: '',
      isSyncing: false,

      toggleSection: (sectionId) => {
        const current = get().expandedSections;
        const isExpanded = current.includes(sectionId);
        set({
          expandedSections: isExpanded
            ? current.filter((id) => id !== sectionId)
            : [sectionId], // Accordion: only one section open at a time
        });
      },

      setSearchQuery: (query) => set({ searchQuery: query }),

      setExpandedSections: (sections) =>
        set({ expandedSections: sections }),

      syncFromServer: (preferences) => {
        if (preferences?.expandedSections?.length > 0) {
          set({ expandedSections: preferences.expandedSections });
        } else {
          // Always default to daily-operations if no server preference
          set({ expandedSections: DEFAULT_EXPANDED });
        }
      },

      setSyncing: (syncing) => set({ isSyncing: syncing }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage, {
        reviver: (_key, value) => value,
      }),
      partialize: (state) => ({
        expandedSections: state.expandedSections,
      }),
    }
  )
);
