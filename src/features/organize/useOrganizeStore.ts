import { create } from 'zustand';

export type OrganizeRotation = 0 | 90 | 180 | 270;

/** Sentinel value used inside `pageOrder` for blank pages inserted by the user. */
export const BLANK_PAGE_MARKER = -1;

function normalizeRotation(angle: number): OrganizeRotation {
  const m = (((angle % 360) + 360) % 360) as OrganizeRotation;
  return m;
}

interface OrganizeState {
  /**
   * Ordered list of source page indices (0-based) representing the final
   * document. Deleted pages are omitted. `BLANK_PAGE_MARKER` (-1) denotes a
   * user-inserted blank page.
   */
  pageOrder: number[];
  /** Rotation to APPLY on top of the source page's existing rotation. */
  rotations: Record<number, OrganizeRotation>;
  setPageOrder: (order: number[]) => void;
  reorderPage: (fromIdx: number, toIdx: number) => void;
  deletePage: (positionIdx: number) => void;
  rotatePage: (positionIdx: number, delta: 90 | -90 | 180) => void;
  addBlankPage: () => void;
  setPageCount: (n: number) => void;
  reset: () => void;
}

export const useOrganizeStore = create<OrganizeState>((set) => ({
  pageOrder: [],
  rotations: {},
  setPageOrder: (order) => set({ pageOrder: order }),
  reorderPage: (fromIdx, toIdx) =>
    set((state) => {
      if (
        fromIdx === toIdx ||
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= state.pageOrder.length ||
        toIdx >= state.pageOrder.length
      ) {
        return {};
      }
      const next = state.pageOrder.slice();
      const [moved] = next.splice(fromIdx, 1);
      if (moved === undefined) return {};
      next.splice(toIdx, 0, moved);
      return { pageOrder: next };
    }),
  deletePage: (positionIdx) =>
    set((state) => {
      if (positionIdx < 0 || positionIdx >= state.pageOrder.length) return {};
      const next = state.pageOrder.slice();
      next.splice(positionIdx, 1);
      return { pageOrder: next };
    }),
  rotatePage: (positionIdx, delta) =>
    set((state) => {
      const src = state.pageOrder[positionIdx];
      if (src === undefined) return {};
      // Rotations keyed by *position* so blank pages and duplicates work.
      const current = state.rotations[positionIdx] ?? 0;
      const next = normalizeRotation(current + delta);
      return { rotations: { ...state.rotations, [positionIdx]: next } };
    }),
  addBlankPage: () =>
    set((state) => ({ pageOrder: [...state.pageOrder, BLANK_PAGE_MARKER] })),
  setPageCount: (n) =>
    set(() => ({
      pageOrder: Array.from({ length: n }, (_, i) => i),
      rotations: {},
    })),
  reset: () => set({ pageOrder: [], rotations: {} }),
}));
