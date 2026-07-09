import { create } from 'zustand';
import type {
  PageNumbersFormat,
  PageNumbersPosition,
} from './pageNumbersProcessor';

interface PageNumbersState {
  format: PageNumbersFormat;
  startFrom: number;
  fontSize: number;
  position: PageNumbersPosition;

  setFormat: (f: PageNumbersFormat) => void;
  setStartFrom: (n: number) => void;
  setFontSize: (n: number) => void;
  setPosition: (p: PageNumbersPosition) => void;
}

export const usePageNumbersStore = create<PageNumbersState>((set) => ({
  format: 'simple',
  startFrom: 1,
  fontSize: 12,
  position: 'bottom-center',

  setFormat: (format) => set({ format }),
  setStartFrom: (startFrom) => set({ startFrom }),
  setFontSize: (fontSize) => set({ fontSize }),
  setPosition: (position) => set({ position }),
}));
