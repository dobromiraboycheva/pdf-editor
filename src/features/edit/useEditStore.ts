import { create } from 'zustand';
import { produce } from 'immer';
import type {
  Annotation,
  AnnotationPatch,
  TextAlignment,
  TextFontFamily,
} from './annotationTypes';

export type EditToolKind =
  | 'select'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'freehand'
  | 'highlight'
  | 'image'
  | 'signature'
  | 'region';

/**
 * Ephemeral rectangle selection produced by the Region tool. Held outside the
 * undo/redo history because it isn't a persistent annotation — the user drags
 * to define it, then chooses an action (copy / move / hide / save) that
 * commits actual annotations.
 */
export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
}

const HISTORY_LIMIT = 50;
/** Offset applied to pasted / duplicated annotations so they don't sit on top. */
const PASTE_OFFSET_PT = 20;

interface EditState {
  annotations: Annotation[];
  currentTool: EditToolKind;
  selectedId: string | null;
  currentPageIndex: number;
  /**
   * Current page size in PDF points, published by `EditCanvas` as it renders.
   * Consumers (e.g. edit-mode tool buttons that need to place a new annotation
   * at the center of the current page) read this at click time. Zero when no
   * page has rendered yet — callers should fall back to a sensible default.
   */
  currentPageWidth: number;
  currentPageHeight: number;
  setCurrentPageSize: (width: number, height: number) => void;

  // Undo/redo history — snapshots of the annotation array.
  past: Annotation[][];
  future: Annotation[][];

  // Style state shared by tools.
  strokeHex: string;
  fillHex: string | null;
  strokeWidth: number;
  fontSize: number;
  opacity: number;
  textColorHex: string;
  highlightHex: string;
  textBold: boolean;
  textItalic: boolean;
  textUnderline: boolean;
  textFontFamily: TextFontFamily;
  textAlignment: TextAlignment;

  // Saved signature (session-scoped). Set by the SignatureModal, consumed by
  // EditCanvas when the signature tool is active and the user clicks a page.
  savedSignatureDataUrl: string | null;
  savedSignatureBlob: Blob | null;
  setSignature: (dataUrl: string, blob: Blob) => void;
  clearSignature: () => void;

  // Clipboard — one annotation at a time, session-scoped, in PDF-space.
  clipboardAnnotation: Annotation | null;
  copySelection: () => void;
  paste: (pageIndex: number, offsetX?: number, offsetY?: number) => void;
  duplicateSelection: () => void;

  // Tool + selection.
  setTool: (t: EditToolKind) => void;
  setCurrentPage: (idx: number) => void;
  setSelected: (id: string | null) => void;

  // Region-select ephemeral state (not history-tracked). Cleared on tool
  // change and on reset.
  regionRect: RegionRect | null;
  setRegionRect: (r: RegionRect | null) => void;

  // Mutations (history-tracked).
  addAnnotation: (a: Annotation) => void;
  updateAnnotation: (id: string, patch: AnnotationPatch) => void;
  removeAnnotation: (id: string) => void;
  clearPage: (pageIndex: number) => void;
  clearAll: () => void;

  // Live freehand drawing helpers — used during a stroke so we don't push
  // 60 history entries per second.
  appendFreehandPoint: (id: string, x: number, y: number) => void;

  undo: () => void;
  redo: () => void;

  // Style setters.
  setStrokeHex: (v: string) => void;
  setFillHex: (v: string | null) => void;
  setStrokeWidth: (v: number) => void;
  setFontSize: (v: number) => void;
  setOpacity: (v: number) => void;
  setTextColorHex: (v: string) => void;
  setHighlightHex: (v: string) => void;
  setTextBold: (v: boolean) => void;
  setTextItalic: (v: boolean) => void;
  setTextUnderline: (v: boolean) => void;
  setTextFontFamily: (v: TextFontFamily) => void;
  setTextAlignment: (v: TextAlignment) => void;

  reset: () => void;
}

function pushHistory(past: Annotation[][], snapshot: Annotation[]): Annotation[][] {
  const next = past.concat([snapshot]);
  if (next.length > HISTORY_LIMIT) next.splice(0, next.length - HISTORY_LIMIT);
  return next;
}

function cloneAnnotations(list: Annotation[]): Annotation[] {
  return list.map((a) => ({ ...a }));
}

function makeCloneId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Deep-enough clone for a single annotation. `Blob` (on ImageAnnotation) is
 * safe to alias — it's immutable — but `points` on freehand must not share
 * its array reference with the source.
 */
function cloneAnnotation(a: Annotation): Annotation {
  if (a.kind === 'freehand') {
    return { ...a, points: a.points.map((p) => ({ x: p.x, y: p.y })) };
  }
  return { ...a };
}

/** Applies an in-place (x, y) offset to an annotation regardless of shape. */
function offsetAnnotationInPlace(a: Annotation, dx: number, dy: number): void {
  if (a.kind === 'line' || a.kind === 'arrow') {
    a.x1 += dx;
    a.x2 += dx;
    a.y1 += dy;
    a.y2 += dy;
    return;
  }
  if (a.kind === 'freehand') {
    a.points = a.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    return;
  }
  a.x += dx;
  a.y += dy;
}

export const useEditStore = create<EditState>((set, get) => ({
  annotations: [],
  currentTool: 'select',
  selectedId: null,
  currentPageIndex: 0,
  currentPageWidth: 0,
  currentPageHeight: 0,
  setCurrentPageSize: (width, height) =>
    set({ currentPageWidth: width, currentPageHeight: height }),

  past: [],
  future: [],

  strokeHex: '#111111',
  fillHex: null,
  strokeWidth: 2,
  fontSize: 32,
  opacity: 1,
  textColorHex: '#111111',
  highlightHex: '#FFEB3B',
  textBold: false,
  textItalic: false,
  textUnderline: false,
  textFontFamily: 'Helvetica',
  textAlignment: 'left',

  savedSignatureDataUrl: null,
  savedSignatureBlob: null,

  setSignature: (dataUrl, blob) =>
    set({ savedSignatureDataUrl: dataUrl, savedSignatureBlob: blob }),
  clearSignature: () =>
    set({ savedSignatureDataUrl: null, savedSignatureBlob: null }),

  clipboardAnnotation: null,

  copySelection: () => {
    const s = get();
    const sel = s.annotations.find((a) => a.id === s.selectedId);
    if (!sel) return;
    set({ clipboardAnnotation: cloneAnnotation(sel) });
  },

  paste: (pageIndex, offsetX = PASTE_OFFSET_PT, offsetY = PASTE_OFFSET_PT) => {
    const clip = get().clipboardAnnotation;
    if (!clip) return;
    const cloned = cloneAnnotation(clip);
    cloned.id = makeCloneId();
    cloned.pageIndex = pageIndex;
    offsetAnnotationInPlace(cloned, offsetX, offsetY);
    set((s) =>
      produce(s, (draft) => {
        draft.past = pushHistory(draft.past, cloneAnnotations(s.annotations));
        draft.future = [];
        draft.annotations.push(cloned);
        draft.selectedId = cloned.id;
      }),
    );
  },

  duplicateSelection: () => {
    const s = get();
    const sel = s.annotations.find((a) => a.id === s.selectedId);
    if (!sel) return;
    // Copy first (so clipboard reflects the last "copy" action), then paste
    // onto the same page. Duplicate is a shortcut for copy+paste-in-place.
    set({ clipboardAnnotation: cloneAnnotation(sel) });
    get().paste(sel.pageIndex);
  },

  setTool: (t) =>
    set((s) => ({
      currentTool: t,
      // Any tool change abandons an in-progress region selection.
      regionRect: t === s.currentTool ? s.regionRect : null,
    })),
  setCurrentPage: (idx) => set({ currentPageIndex: idx, selectedId: null, regionRect: null }),
  setSelected: (id) => set({ selectedId: id }),

  regionRect: null,
  setRegionRect: (r) => set({ regionRect: r }),

  addAnnotation: (a) =>
    set((s) =>
      produce(s, (draft) => {
        draft.past = pushHistory(draft.past, cloneAnnotations(s.annotations));
        draft.future = [];
        draft.annotations.push(a);
      }),
    ),

  updateAnnotation: (id, patch) =>
    set((s) =>
      produce(s, (draft) => {
        draft.past = pushHistory(draft.past, cloneAnnotations(s.annotations));
        draft.future = [];
        const idx = draft.annotations.findIndex((a) => a.id === id);
        if (idx < 0) return;
        const existing = draft.annotations[idx];
        // Merge shallowly, preserving the kind discriminant.
        draft.annotations[idx] = { ...existing, ...patch } as Annotation;
      }),
    ),

  removeAnnotation: (id) =>
    set((s) =>
      produce(s, (draft) => {
        draft.past = pushHistory(draft.past, cloneAnnotations(s.annotations));
        draft.future = [];
        draft.annotations = draft.annotations.filter((a) => a.id !== id);
        if (draft.selectedId === id) draft.selectedId = null;
      }),
    ),

  clearPage: (pageIndex) =>
    set((s) =>
      produce(s, (draft) => {
        draft.past = pushHistory(draft.past, cloneAnnotations(s.annotations));
        draft.future = [];
        draft.annotations = draft.annotations.filter(
          (a) => a.pageIndex !== pageIndex,
        );
        draft.selectedId = null;
      }),
    ),

  clearAll: () =>
    set((s) =>
      produce(s, (draft) => {
        draft.past = pushHistory(draft.past, cloneAnnotations(s.annotations));
        draft.future = [];
        draft.annotations = [];
        draft.selectedId = null;
      }),
    ),

  appendFreehandPoint: (id, x, y) =>
    set((s) =>
      produce(s, (draft) => {
        const a = draft.annotations.find((it) => it.id === id);
        if (!a || a.kind !== 'freehand') return;
        a.points.push({ x, y });
      }),
    ),

  undo: () =>
    set((s) =>
      produce(s, (draft) => {
        const prev = draft.past.pop();
        if (!prev) return;
        draft.future.push(cloneAnnotations(s.annotations));
        draft.annotations = prev;
        draft.selectedId = null;
      }),
    ),

  redo: () =>
    set((s) =>
      produce(s, (draft) => {
        const next = draft.future.pop();
        if (!next) return;
        draft.past.push(cloneAnnotations(s.annotations));
        draft.annotations = next;
        draft.selectedId = null;
      }),
    ),

  setStrokeHex: (v) => set({ strokeHex: v }),
  setFillHex: (v) => set({ fillHex: v }),
  setStrokeWidth: (v) => set({ strokeWidth: v }),
  setFontSize: (v) => set({ fontSize: v }),
  setOpacity: (v) => set({ opacity: v }),
  setTextColorHex: (v) => set({ textColorHex: v }),
  setHighlightHex: (v) => set({ highlightHex: v }),
  setTextBold: (v) => set({ textBold: v }),
  setTextItalic: (v) => set({ textItalic: v }),
  setTextUnderline: (v) => set({ textUnderline: v }),
  setTextFontFamily: (v) => set({ textFontFamily: v }),
  setTextAlignment: (v) => set({ textAlignment: v }),

  reset: () =>
    set({
      annotations: [],
      selectedId: null,
      currentTool: 'select',
      currentPageIndex: 0,
      currentPageWidth: 0,
      currentPageHeight: 0,
      past: [],
      future: [],
      clipboardAnnotation: null,
      regionRect: null,
    }),
}));
