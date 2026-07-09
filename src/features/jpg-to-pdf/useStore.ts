import { create } from 'zustand';

export type JpgToPdfPageSize = 'a4' | 'letter' | 'fit';
export type JpgToPdfOrientation = 'portrait' | 'landscape' | 'auto';

interface JpgToPdfState {
  images: File[];
  pageSize: JpgToPdfPageSize;
  orientation: JpgToPdfOrientation;
  marginPt: number;
  addImages: (files: File[]) => void;
  removeImage: (index: number) => void;
  reorderImages: (fromIdx: number, toIdx: number) => void;
  clearImages: () => void;
  setPageSize: (size: JpgToPdfPageSize) => void;
  setOrientation: (orientation: JpgToPdfOrientation) => void;
  setMarginPt: (marginPt: number) => void;
}

export const useJpgToPdfStore = create<JpgToPdfState>((set) => ({
  images: [],
  pageSize: 'a4',
  orientation: 'auto',
  marginPt: 24,
  addImages: (files) =>
    set((state) => {
      if (files.length === 0) return state;
      // Dedupe by name+size+lastModified within the same session.
      const key = (f: File): string => `${f.name}::${f.size}::${f.lastModified}`;
      const existing = new Set(state.images.map(key));
      const additions = files.filter((f) => !existing.has(key(f)));
      if (additions.length === 0) return state;
      return { images: [...state.images, ...additions] };
    }),
  removeImage: (index) =>
    set((state) => {
      if (index < 0 || index >= state.images.length) return state;
      const next = state.images.slice();
      next.splice(index, 1);
      return { images: next };
    }),
  reorderImages: (fromIdx, toIdx) =>
    set((state) => {
      if (
        fromIdx === toIdx ||
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= state.images.length ||
        toIdx >= state.images.length
      ) {
        return state;
      }
      const next = state.images.slice();
      const [moved] = next.splice(fromIdx, 1);
      if (!moved) return state;
      next.splice(toIdx, 0, moved);
      return { images: next };
    }),
  clearImages: () => set({ images: [] }),
  setPageSize: (pageSize) => set({ pageSize }),
  setOrientation: (orientation) => set({ orientation }),
  setMarginPt: (marginPt) => set({ marginPt }),
}));
