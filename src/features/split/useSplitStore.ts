import { create } from 'zustand';
import type { SplitMode } from './splitProcessor';

interface SplitState {
  mode: SplitMode;
  rangesSpec: string;
  everyN: number;
  setMode: (m: SplitMode) => void;
  setRangesSpec: (s: string) => void;
  setEveryN: (n: number) => void;
}

export const useSplitStore = create<SplitState>((set) => ({
  mode: 'ranges',
  rangesSpec: '',
  everyN: 2,
  setMode: (mode) => set({ mode }),
  setRangesSpec: (rangesSpec) => set({ rangesSpec }),
  setEveryN: (everyN) => set({ everyN }),
}));
