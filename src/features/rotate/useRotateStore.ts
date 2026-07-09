import { create } from 'zustand';

export type RotateAngle = 0 | 90 | 180 | 270;

function normalize(angle: number): RotateAngle {
  const m = (((angle % 360) + 360) % 360) as RotateAngle;
  return m;
}

interface RotateState {
  /** Page index → applied rotation (degrees clockwise). */
  rotations: Record<number, RotateAngle>;
  pageCount: number;
  rotate: (pageIndex: number, delta: 90 | -90 | 180) => void;
  rotateAll: (delta: 90 | -90 | 180) => void;
  reset: () => void;
  setPageCount: (n: number) => void;
}

export const useRotateStore = create<RotateState>((set) => ({
  rotations: {},
  pageCount: 0,
  rotate: (pageIndex, delta) =>
    set((state) => {
      const current = state.rotations[pageIndex] ?? 0;
      const next = normalize(current + delta);
      return {
        rotations: { ...state.rotations, [pageIndex]: next },
      };
    }),
  rotateAll: (delta) =>
    set((state) => {
      const next: Record<number, RotateAngle> = { ...state.rotations };
      for (let i = 0; i < state.pageCount; i++) {
        const current = next[i] ?? 0;
        next[i] = normalize(current + delta);
      }
      return { rotations: next };
    }),
  reset: () => set({ rotations: {} }),
  setPageCount: (n) => set({ pageCount: n }),
}));
