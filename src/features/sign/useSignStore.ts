import { create } from 'zustand';

export interface SignStamp {
  id: string;
  pageIndex: number;
  /** CSS-space top-left coordinates within the rendered page overlay. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** CSS-space overlay size at placement time — used to convert to PDF-space. */
  overlayCssWidth: number;
  overlayCssHeight: number;
}

interface SignState {
  signatureDataUrl: string | null;
  signatureBlob: Blob | null;
  stamps: SignStamp[];
  currentPageIndex: number;
  setSignature: (dataUrl: string | null, blob: Blob | null) => void;
  addStamp: (stamp: SignStamp) => void;
  removeStamp: (id: string) => void;
  setCurrentPageIndex: (i: number) => void;
  reset: () => void;
}

export const useSignStore = create<SignState>((set) => ({
  signatureDataUrl: null,
  signatureBlob: null,
  stamps: [],
  currentPageIndex: 0,
  setSignature: (signatureDataUrl, signatureBlob) =>
    set({ signatureDataUrl, signatureBlob }),
  addStamp: (stamp) => set((s) => ({ stamps: [...s.stamps, stamp] })),
  removeStamp: (id) =>
    set((s) => ({ stamps: s.stamps.filter((st) => st.id !== id) })),
  setCurrentPageIndex: (currentPageIndex) => set({ currentPageIndex }),
  reset: () =>
    set({
      signatureDataUrl: null,
      signatureBlob: null,
      stamps: [],
      currentPageIndex: 0,
    }),
}));
