import { create } from 'zustand';

export type OcrLanguage = 'eng' | 'bul' | 'eng+bul';

interface OcrState {
  language: OcrLanguage;
  setLanguage: (language: OcrLanguage) => void;
}

export const useOcrStore = create<OcrState>((set) => ({
  language: 'eng',
  setLanguage: (language) => set({ language }),
}));
