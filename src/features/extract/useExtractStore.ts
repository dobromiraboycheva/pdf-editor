import { create } from 'zustand';

interface ExtractState {
  rangesSpec: string;
  setRangesSpec: (s: string) => void;
}

export const useExtractStore = create<ExtractState>((set) => ({
  rangesSpec: '',
  setRangesSpec: (rangesSpec) => set({ rangesSpec }),
}));
