import { create } from 'zustand';

interface MergeState {
  // Reserved for future options (e.g. add-toc toggle)
  _dummy?: never;
}

export const useMergeStore = create<MergeState>(() => ({}));
