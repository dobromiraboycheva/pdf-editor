import { create } from 'zustand';

export type ScanPageSize = 'a4' | 'letter' | 'fit';

interface ScanState {
  pages: Blob[];
  pageSize: ScanPageSize;
  addPage: (blob: Blob) => void;
  removePage: (index: number) => void;
  reorderPages: (from: number, to: number) => void;
  clear: () => void;
  setPageSize: (s: ScanPageSize) => void;
}

export const useScanStore = create<ScanState>((set) => ({
  pages: [],
  pageSize: 'a4',
  addPage: (blob) => set((state) => ({ pages: [...state.pages, blob] })),
  removePage: (index) =>
    set((state) => ({ pages: state.pages.filter((_, i) => i !== index) })),
  reorderPages: (from, to) =>
    set((state) => {
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= state.pages.length ||
        to >= state.pages.length
      ) {
        return state;
      }
      const next = state.pages.slice();
      const [moved] = next.splice(from, 1);
      if (!moved) return state;
      next.splice(to, 0, moved);
      return { pages: next };
    }),
  clear: () => set({ pages: [] }),
  setPageSize: (s) => set({ pageSize: s }),
}));
