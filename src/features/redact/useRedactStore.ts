import { create } from 'zustand';

export interface RedactRect {
  id: string;
  pageIndex: number;
  /** CSS-space top-left within the rendered overlay. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** CSS-space overlay size at draw time — used for PDF-space conversion. */
  overlayCssWidth: number;
  overlayCssHeight: number;
}

interface RedactState {
  rects: RedactRect[];
  currentPageIndex: number;
  addRect: (r: RedactRect) => void;
  updateRect: (id: string, patch: Partial<RedactRect>) => void;
  removeRect: (id: string) => void;
  setCurrentPageIndex: (i: number) => void;
  reset: () => void;
}

export const useRedactStore = create<RedactState>((set) => ({
  rects: [],
  currentPageIndex: 0,
  addRect: (r) => set((s) => ({ rects: [...s.rects, r] })),
  updateRect: (id, patch) =>
    set((s) => ({
      rects: s.rects.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),
  removeRect: (id) =>
    set((s) => ({ rects: s.rects.filter((r) => r.id !== id) })),
  setCurrentPageIndex: (currentPageIndex) => set({ currentPageIndex }),
  reset: () => set({ rects: [], currentPageIndex: 0 }),
}));
