import { create } from 'zustand';
import type { CropRect } from './cropProcessor';

interface CropState {
  rect: CropRect | null; // in PDF-space of the current reference page
  applyToAll: boolean;
  currentPageIndex: number;
  setRect: (r: CropRect | null) => void;
  setApplyToAll: (v: boolean) => void;
  setCurrentPageIndex: (i: number) => void;
  reset: () => void;
}

export const useCropStore = create<CropState>((set) => ({
  rect: null,
  applyToAll: true,
  currentPageIndex: 0,
  setRect: (rect) => set({ rect }),
  setApplyToAll: (applyToAll) => set({ applyToAll }),
  setCurrentPageIndex: (currentPageIndex) => set({ currentPageIndex }),
  reset: () => set({ rect: null, currentPageIndex: 0 }),
}));
