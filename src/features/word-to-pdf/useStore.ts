import { create } from 'zustand';

export type WordToPdfPageSize = 'a4' | 'letter';

interface WordToPdfState {
  file: File | null;
  pageSize: WordToPdfPageSize;
  setFile: (f: File | null) => void;
  setPageSize: (s: WordToPdfPageSize) => void;
}

export const useWordToPdfStore = create<WordToPdfState>((set) => ({
  file: null,
  pageSize: 'a4',
  setFile: (file) => set({ file }),
  setPageSize: (pageSize) => set({ pageSize }),
}));
