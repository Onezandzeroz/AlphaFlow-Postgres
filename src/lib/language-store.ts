// Language store for UI localization (Danish/English)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Language = 'da' | 'en';

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: 'da', // Default to Danish
      setLanguage: (language) => set({ language }),
      toggleLanguage: () => {
        const current = get().language;
        set({ language: current === 'da' ? 'en' : 'da' });
      },
    }),
    {
      name: 'alphaai-language',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
