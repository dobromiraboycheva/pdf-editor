import { create } from 'zustand';
import type { CompressLevel } from '@/lib/pdf/compressImages';

interface CompressState {
  level: CompressLevel;
  setLevel: (level: CompressLevel) => void;
}

export const useCompressStore = create<CompressState>((set) => ({
  level: 'medium',
  setLevel: (level) => set({ level }),
}));
