import { create } from 'zustand';

export type JpgQuality = 'low' | 'medium' | 'high';

interface PdfToJpgState {
  quality: JpgQuality;
  dpi: number;
  setQuality: (quality: JpgQuality) => void;
  setDpi: (dpi: number) => void;
}

export const usePdfToJpgStore = create<PdfToJpgState>((set) => ({
  quality: 'medium',
  dpi: 150,
  setQuality: (quality) => set({ quality }),
  setDpi: (dpi) => set({ dpi }),
}));
