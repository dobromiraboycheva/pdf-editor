import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Layer, Rect as KonvaRect, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { TextLayer as PdfJsTextLayer } from 'pdfjs-dist';
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Trash2,
  Copy,
  Pencil,
  Move,
  EyeOff,
  Download,
} from 'lucide-react';
import './textLayer.css';
import type {
  Annotation,
  AnnotationPatch,
  FreehandAnnotation,
  ImageAnnotation,
  RectAnnotation,
  TextAnnotation,
} from './annotationTypes';
import { useEditStore } from './useEditStore';
import type { PageSpace } from './pdfSpaceMap';
import { canvasToPdf, pdfToCanvas, scaleFactor } from './pdfSpaceMap';
import { TextLayer } from './layers/TextLayer';
import { ShapeLayer } from './layers/ShapeLayer';
import { FreehandLayer } from './layers/FreehandLayer';
import { ImageLayer } from './layers/ImageLayer';
import { HighlightLayer } from './layers/HighlightLayer';
import { downloadBlob } from '@/lib/files/download';

/** Base CSS width the pdf.js canvas is rendered at (before zoom). */
const BASE_WIDTH_PX = 900;
const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
/** Comfortable default box for a new text annotation. */
const DEFAULT_TEXT_WIDTH_PT = 320;
const DEFAULT_TEXT_HEIGHT_PT = 80;

interface Props {
  pdfjsDoc: PDFDocumentProxy;
  pageIndex: number;
}

interface DraftState {
  id: string;
  kind: Annotation['kind'];
  startX: number;
  startY: number;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function EditCanvas({ pdfjsDoc, pageIndex }: Props) {
  const { t } = useTranslation();
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const textLayerTaskRef = useRef<PdfJsTextLayer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [pageSpace, setPageSpace] = useState<PageSpace | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const draftRef = useRef<DraftState | null>(null);
  const regionDraftRef = useRef<{ startX: number; startY: number } | null>(null);
  const [regionDrafting, setRegionDrafting] = useState(false);
  const regionShapeRef = useRef<Konva.Rect | null>(null);
  const regionTransformerRef = useRef<Konva.Transformer | null>(null);
  const [zoom, setZoom] = useState(1);
  // Transient confirmation shown after a region Copy that put real text on the
  // clipboard. Auto-clears after a short delay.
  const [regionNotice, setRegionNotice] = useState<string | null>(null);
  const regionNoticeTimerRef = useRef<number | null>(null);

  const showRegionNotice = useCallback((msg: string) => {
    setRegionNotice(msg);
    if (regionNoticeTimerRef.current !== null) {
      window.clearTimeout(regionNoticeTimerRef.current);
    }
    regionNoticeTimerRef.current = window.setTimeout(() => {
      setRegionNotice(null);
      regionNoticeTimerRef.current = null;
    }, 2400);
  }, []);

  useEffect(
    () => () => {
      if (regionNoticeTimerRef.current !== null) {
        window.clearTimeout(regionNoticeTimerRef.current);
      }
    },
    [],
  );

  const annotations = useEditStore((s) => s.annotations);
  const currentTool = useEditStore((s) => s.currentTool);
  const selectedId = useEditStore((s) => s.selectedId);
  const setSelected = useEditStore((s) => s.setSelected);
  const addAnnotation = useEditStore((s) => s.addAnnotation);
  const updateAnnotation = useEditStore((s) => s.updateAnnotation);
  const removeAnnotation = useEditStore((s) => s.removeAnnotation);
  const appendFreehandPoint = useEditStore((s) => s.appendFreehandPoint);
  const copySelection = useEditStore((s) => s.copySelection);
  const paste = useEditStore((s) => s.paste);
  const duplicateSelection = useEditStore((s) => s.duplicateSelection);
  const regionRect = useEditStore((s) => s.regionRect);
  const setRegionRect = useEditStore((s) => s.setRegionRect);
  const strokeHex = useEditStore((s) => s.strokeHex);
  const fillHex = useEditStore((s) => s.fillHex);
  const strokeWidth = useEditStore((s) => s.strokeWidth);
  const fontSize = useEditStore((s) => s.fontSize);
  const opacity = useEditStore((s) => s.opacity);
  const textColorHex = useEditStore((s) => s.textColorHex);
  const highlightHex = useEditStore((s) => s.highlightHex);
  const textBold = useEditStore((s) => s.textBold);
  const textItalic = useEditStore((s) => s.textItalic);
  const textUnderline = useEditStore((s) => s.textUnderline);
  const textFontFamily = useEditStore((s) => s.textFontFamily);
  const textAlignment = useEditStore((s) => s.textAlignment);

  const pageAnnotations = useMemo(
    () => annotations.filter((a) => a.pageIndex === pageIndex),
    [annotations, pageIndex],
  );

  // Render the pdf.js background whenever page OR zoom changes.
  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    (async () => {
      const page = await pdfjsDoc.getPage(pageIndex + 1);
      if (cancelled) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const cssScale = (BASE_WIDTH_PX * zoom) / baseViewport.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bitmapScale = cssScale * dpr;
      const viewport = page.getViewport({ scale: bitmapScale });

      const canvas = backgroundCanvasRef.current;
      if (!canvas) return;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.round(baseViewport.width * cssScale)}px`;
      canvas.style.height = `${Math.round(baseViewport.height * cssScale)}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderTask = page.render({ canvasContext: ctx, viewport });
      try {
        await renderTask.promise;
      } catch {
        // cancelled — no-op
      }

      if (cancelled) return;
      const cssWidth = Math.round(baseViewport.width * cssScale);
      const cssHeight = Math.round(baseViewport.height * cssScale);
      setPageSpace({
        pdfWidth: baseViewport.width,
        pdfHeight: baseViewport.height,
        canvasWidth: cssWidth,
        canvasHeight: cssHeight,
      });
      useEditStore
        .getState()
        .setCurrentPageSize(baseViewport.width, baseViewport.height);

      // Render the selectable text layer at the CSS-sized viewport so its
      // spans line up perfectly with what the user sees on the canvas.
      const textLayerEl = textLayerRef.current;
      if (textLayerEl) {
        // Cancel any previous text layer render and clear the container.
        textLayerTaskRef.current?.cancel();
        textLayerTaskRef.current = null;
        textLayerEl.replaceChildren();

        const cssViewport = page.getViewport({ scale: cssScale });
        textLayerEl.style.width = `${cssWidth}px`;
        textLayerEl.style.height = `${cssHeight}px`;
        // pdf.js reads --scale-factor from CSS to size spans correctly.
        textLayerEl.style.setProperty('--scale-factor', String(cssScale));

        try {
          // `disableCombineTextItems: false` and `includeMarkedContent: true`
          // give pdf.js the hints it needs to produce a proper reading order
          // for text-layer selection. Without these, drag-selection jumps
          // between fragmented spans and produces jumbled clipboard text.
          const textContent = await page.getTextContent({
            includeMarkedContent: true,
            disableNormalization: false,
          });
          if (cancelled) return;
          const task = new PdfJsTextLayer({
            textContentSource: textContent,
            container: textLayerEl,
            viewport: cssViewport,
          });
          textLayerTaskRef.current = task;
          await task.render();
        } catch {
          // cancelled or unavailable — no-op
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayerTaskRef.current?.cancel();
      textLayerTaskRef.current = null;
    };
  }, [pdfjsDoc, pageIndex, zoom]);

  // ============ Zoom controls ============

  const zoomIn = useCallback(() => {
    setZoom((z) => {
      const next = ZOOM_LEVELS.find((v) => v > z);
      return next ?? z;
    });
  }, []);
  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const prevs = ZOOM_LEVELS.filter((v) => v < z);
      return prevs.length > 0 ? prevs[prevs.length - 1] : z;
    });
  }, []);
  const zoomReset = useCallback(() => setZoom(1), []);
  const zoomFit = useCallback(() => {
    const parentEl = containerRef.current?.parentElement;
    if (!parentEl) return;
    const targetWidth = parentEl.clientWidth - 48;
    setZoom(Math.max(0.25, Math.min(4, targetWidth / BASE_WIDTH_PX)));
  }, []);

  // Cmd/Ctrl + mouse wheel = zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomIn, zoomOut]);

  // ============ Stage mouse handling ============

  const getStagePointer = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    return pos ?? null;
  }, []);

  const handleStageMouseDown = useCallback(
    async (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!pageSpace) return;
      const stage = stageRef.current;
      if (!stage) return;
      const hitEmpty = e.target === stage;
      if (!hitEmpty) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;
      const pdfPt = canvasToPdf(pageSpace, pos.x, pos.y);

      if (currentTool === 'select') {
        setSelected(null);
        return;
      }

      if (currentTool === 'region') {
        // Start a draft region rectangle. Not persisted as an annotation —
        // stored in ephemeral store state so the surrounding action toolbar
        // can drive copy / move / hide / save.
        setSelected(null);
        setRegionRect({
          x: pdfPt.x,
          y: pdfPt.y,
          width: 0.001,
          height: 0.001,
          pageIndex,
        });
        regionDraftRef.current = { startX: pdfPt.x, startY: pdfPt.y };
        setRegionDrafting(true);
        return;
      }

      if (currentTool === 'signature') {
        const state = useEditStore.getState();
        const dataUrl = state.savedSignatureDataUrl;
        const blob = state.savedSignatureBlob;
        if (!dataUrl || !blob) return;
        const img = new window.Image();
        img.src = dataUrl;
        try {
          await img.decode();
        } catch {
          return;
        }
        const targetWidth = 200;
        const aspect =
          img.naturalHeight > 0 && img.naturalWidth > 0
            ? img.naturalHeight / img.naturalWidth
            : 0.4;
        const id = makeId();
        const mimeType: 'image/png' | 'image/jpeg' =
          blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        const a: ImageAnnotation = {
          id,
          kind: 'image',
          pageIndex,
          x: Math.max(0, pdfPt.x - targetWidth / 2),
          y: pdfPt.y,
          width: targetWidth,
          height: targetWidth * aspect,
          dataUrl,
          mimeType,
          fileBlob: blob,
        };
        addAnnotation(a);
        setSelected(id);
        // Auto-switch back to select after placing the signature — otherwise
        // every subsequent click would place another copy.
        useEditStore.getState().setTool('select');
        return;
      }

      if (currentTool === 'text') {
        const id = makeId();
        const a: TextAnnotation = {
          id,
          kind: 'text',
          pageIndex,
          x: Math.max(0, pdfPt.x - DEFAULT_TEXT_WIDTH_PT / 2),
          y: pdfPt.y,
          // Placeholder default so the annotation is visible immediately.
          // The textarea (opened right after) auto-selects it so typing
          // overwrites it in one keystroke.
          text: 'Text',
          fontSize,
          colorHex: textColorHex,
          width: DEFAULT_TEXT_WIDTH_PT,
          bold: textBold,
          italic: textItalic,
          underline: textUnderline,
          fontFamily: textFontFamily,
          alignment: textAlignment,
        };
        addAnnotation(a);
        setSelected(id);
        // Auto-switch to select so the next click doesn't spawn another box.
        useEditStore.getState().setTool('select');
        // Open the textarea immediately for editing. onFocus's select() will
        // highlight "Text" so a keystroke overwrites the placeholder.
        setEditingTextId(id);
        return;
      }

      if (currentTool === 'freehand') {
        const id = makeId();
        const a: FreehandAnnotation = {
          id,
          kind: 'freehand',
          pageIndex,
          points: [{ x: pdfPt.x, y: pdfPt.y }],
          strokeHex,
          strokeWidth,
          opacity,
        };
        addAnnotation(a);
        draftRef.current = {
          id,
          kind: 'freehand',
          startX: pdfPt.x,
          startY: pdfPt.y,
        };
        return;
      }

      if (
        currentTool === 'rect' ||
        currentTool === 'ellipse' ||
        currentTool === 'highlight'
      ) {
        const id = makeId();
        const base = {
          id,
          pageIndex,
          x: pdfPt.x,
          y: pdfPt.y,
          width: 0.001,
          height: 0.001,
        };
        let a: Annotation;
        if (currentTool === 'highlight') {
          a = { ...base, kind: 'highlight', colorHex: highlightHex };
        } else if (currentTool === 'rect') {
          a = {
            ...base,
            kind: 'rect',
            strokeHex,
            fillHex: fillHex ?? undefined,
            strokeWidth,
            opacity,
          };
        } else {
          a = {
            ...base,
            kind: 'ellipse',
            strokeHex,
            fillHex: fillHex ?? undefined,
            strokeWidth,
            opacity,
          };
        }
        addAnnotation(a);
        draftRef.current = {
          id,
          kind: currentTool,
          startX: pdfPt.x,
          startY: pdfPt.y,
        };
        return;
      }

      if (currentTool === 'line' || currentTool === 'arrow') {
        const id = makeId();
        const a: Annotation =
          currentTool === 'line'
            ? {
                id,
                kind: 'line',
                pageIndex,
                x1: pdfPt.x,
                y1: pdfPt.y,
                x2: pdfPt.x + 0.001,
                y2: pdfPt.y + 0.001,
                strokeHex,
                strokeWidth,
                opacity,
              }
            : {
                id,
                kind: 'arrow',
                pageIndex,
                x1: pdfPt.x,
                y1: pdfPt.y,
                x2: pdfPt.x + 0.001,
                y2: pdfPt.y + 0.001,
                strokeHex,
                strokeWidth,
                opacity,
              };
        addAnnotation(a);
        draftRef.current = {
          id,
          kind: currentTool,
          startX: pdfPt.x,
          startY: pdfPt.y,
        };
      }
    },
    [
      pageSpace,
      currentTool,
      pageIndex,
      addAnnotation,
      setSelected,
      strokeHex,
      fillHex,
      strokeWidth,
      opacity,
      fontSize,
      textColorHex,
      highlightHex,
      textBold,
      textItalic,
      textUnderline,
      textFontFamily,
      textAlignment,
      t,
    ],
  );

  const handleStageMouseMove = useCallback(() => {
    // Region draft takes precedence — it doesn't share the general `draftRef`
    // path because it doesn't push a live annotation to the store.
    if (regionDraftRef.current && pageSpace) {
      const pos = getStagePointer();
      if (!pos) return;
      const pdfPt = canvasToPdf(pageSpace, pos.x, pos.y);
      const start = regionDraftRef.current;
      const nx = Math.min(start.startX, pdfPt.x);
      const ny = Math.min(start.startY, pdfPt.y);
      const nw = Math.max(1, Math.abs(pdfPt.x - start.startX));
      const nh = Math.max(1, Math.abs(pdfPt.y - start.startY));
      setRegionRect({ x: nx, y: ny, width: nw, height: nh, pageIndex });
      return;
    }
    const draft = draftRef.current;
    if (!draft || !pageSpace) return;
    const pos = getStagePointer();
    if (!pos) return;
    const pdfPt = canvasToPdf(pageSpace, pos.x, pos.y);

    if (draft.kind === 'freehand') {
      appendFreehandPoint(draft.id, pdfPt.x, pdfPt.y);
      return;
    }
    if (
      draft.kind === 'rect' ||
      draft.kind === 'ellipse' ||
      draft.kind === 'highlight'
    ) {
      const nx = Math.min(draft.startX, pdfPt.x);
      const ny = Math.min(draft.startY, pdfPt.y);
      const nw = Math.max(1, Math.abs(pdfPt.x - draft.startX));
      const nh = Math.max(1, Math.abs(pdfPt.y - draft.startY));
      updateAnnotation(draft.id, { x: nx, y: ny, width: nw, height: nh });
      return;
    }
    if (draft.kind === 'line' || draft.kind === 'arrow') {
      updateAnnotation(draft.id, { x2: pdfPt.x, y2: pdfPt.y });
    }
  }, [
    pageSpace,
    getStagePointer,
    appendFreehandPoint,
    updateAnnotation,
    setRegionRect,
    pageIndex,
  ]);

  const handleStageMouseUp = useCallback(() => {
    if (regionDraftRef.current) {
      regionDraftRef.current = null;
      setRegionDrafting(false);
      // If the user just clicked without dragging, discard.
      const r = useEditStore.getState().regionRect;
      if (r && (r.width < 4 || r.height < 4)) {
        setRegionRect(null);
      }
      return;
    }
    const draft = draftRef.current;
    if (!draft) return;
    draftRef.current = null;

    if (
      draft.kind === 'rect' ||
      draft.kind === 'ellipse' ||
      draft.kind === 'highlight'
    ) {
      const cur = useEditStore
        .getState()
        .annotations.find((a) => a.id === draft.id);
      if (
        cur &&
        (cur.kind === 'rect' ||
          cur.kind === 'ellipse' ||
          cur.kind === 'highlight') &&
        (cur.width < 4 || cur.height < 4)
      ) {
        removeAnnotation(draft.id);
        return;
      }
    }
    setSelected(draft.id);
  }, [removeAnnotation, setSelected, setRegionRect]);

  // ============ In-place text editing ============
  // Rendered inline in JSX (see below). We only need the annotation lookup;
  // no DOM manipulation, no side effects.

  const editingAnnotation = useMemo(() => {
    if (!editingTextId) return null;
    const a = annotations.find((x) => x.id === editingTextId);
    return a && a.kind === 'text' ? a : null;
  }, [editingTextId, annotations]);

  const commitEditingText = useCallback(
    (value: string) => {
      if (!editingTextId) return;
      const v = value;
      if (v.trim() === '') {
        removeAnnotation(editingTextId);
      } else {
        updateAnnotation(editingTextId, { text: v });
      }
      setEditingTextId(null);
    },
    [editingTextId, removeAnnotation, updateAnnotation],
  );

  const cancelEditingText = useCallback(() => {
    if (!editingTextId) return;
    // If the annotation is still empty (user opened, hit Esc without typing),
    // clean it up. Otherwise leave the existing text in place.
    const cur = useEditStore
      .getState()
      .annotations.find((a) => a.id === editingTextId);
    if (cur && cur.kind === 'text' && cur.text.trim() === '') {
      removeAnnotation(editingTextId);
    }
    setEditingTextId(null);
  }, [editingTextId, removeAnnotation]);

  // ============ Region-select actions ============
  // Extract the drawn region as a crisp PNG blob. Rather than copying from the
  // on-screen background canvas (rendered at CSS scale × DPR, which is low-res
  // at typical zoom), re-render the PDF page at a high fixed scale and crop the
  // region out of that. This keeps text sharp in the copied / saved image.
  const extractRegionImage = useCallback(async (): Promise<{
    blob: Blob;
    dataUrl: string;
  } | null> => {
    const r = regionRect;
    if (!r || !pageSpace) return null;

    // High-res render scale — 4× for crisp output.
    const HIRES = 4;
    const page = await pdfjsDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: HIRES });
    const full = document.createElement('canvas');
    full.width = Math.ceil(viewport.width);
    full.height = Math.ceil(viewport.height);
    const fctx = full.getContext('2d');
    if (!fctx) return null;
    fctx.fillStyle = '#FFFFFF';
    fctx.fillRect(0, 0, full.width, full.height);
    await page.render({ canvasContext: fctx, viewport }).promise;

    // regionRect.x/y/width/height are in PDF points with a top-left origin
    // (see canvasToPdf). pdf.js viewports also use a top-left origin, so the
    // mapping to hi-res pixels is a pure scale by HIRES — no Y-flip needed.
    const sx = r.x * HIRES;
    const sy = r.y * HIRES;
    const sw = r.width * HIRES;
    const sh = r.height * HIRES;
    if (sw <= 0 || sh <= 0) return null;

    const crop = document.createElement('canvas');
    crop.width = Math.max(1, Math.ceil(sw));
    crop.height = Math.max(1, Math.ceil(sh));
    const cctx = crop.getContext('2d');
    if (!cctx) return null;
    cctx.drawImage(full, sx, sy, sw, sh, 0, 0, crop.width, crop.height);

    const dataUrl = crop.toDataURL('image/png');
    const blob = await new Promise<Blob | null>((res) =>
      crop.toBlob((b) => res(b), 'image/png'),
    );
    if (!blob) return null;
    return { blob, dataUrl };
  }, [regionRect, pageSpace, pdfjsDoc, pageIndex]);

  /**
   * Extract the plain text contained inside the current region rect (if any).
   * Returns the joined text in reading order plus the median font size, or null
   * if the region has little/no text (in which case callers fall back to image
   * capture). Coordinates: regionRect is top-left origin PDF points; pdf.js text
   * items are bottom-left origin, so we flip Y for the containment test.
   */
  const extractRegionText = useCallback(async (): Promise<{
    text: string;
    fontSize: number;
  } | null> => {
    const r = useEditStore.getState().regionRect;
    if (!r || !pageSpace) return null;
    const page = await pdfjsDoc.getPage(pageIndex + 1);
    const content = await page.getTextContent({ includeMarkedContent: false });
    const pageHeight = pageSpace.pdfHeight;
    // Region bounds in bottom-left origin (pdf.js text space).
    const regTop = pageHeight - r.y; // higher y
    const regBottom = pageHeight - (r.y + r.height); // lower y
    const regLeft = r.x;
    const regRight = r.x + r.width;

    interface Item {
      str: string;
      x: number;
      y: number;
      h: number;
    }
    const items: Item[] = [];
    for (const it of content.items) {
      if (!('str' in it)) continue;
      const str = it.str;
      if (!str) continue;
      const tr = it.transform;
      if (!tr) continue;
      const x = tr[4];
      const y = tr[5];
      const h = it.height || Math.abs(tr[3]) || 10;
      // Containment: item baseline y within [regBottom, regTop], x within region.
      if (y <= regTop && y >= regBottom && x >= regLeft - 2 && x <= regRight + 2) {
        items.push({ str, x, y, h });
      }
    }
    if (items.length === 0) return null;

    // Group into lines by y (2pt tolerance), sort lines top→bottom, items left→right.
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: Item[][] = [];
    for (const item of items) {
      const line = lines.find((l) => Math.abs(l[0].y - item.y) < 3);
      if (line) line.push(item);
      else lines.push([item]);
    }
    const text = lines
      .map((line) =>
        line
          .sort((a, b) => a.x - b.x)
          .map((i) => i.str)
          .join('')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((l) => l.length > 0)
      .join('\n');

    if (text.replace(/\s/g, '').length <= 3) return null; // too little text

    // Median font size from item heights.
    const heights = items.map((i) => i.h).sort((a, b) => a - b);
    const fontSize = heights[Math.floor(heights.length / 2)] || 14;

    return { text, fontSize };
  }, [pageSpace, pdfjsDoc, pageIndex]);

  const copyRegion = useCallback(async () => {
    if (!regionRect) return;

    // Text-aware: if the region is mostly text, copy the real text (to the
    // clipboard) and place an editable TextAnnotation, instead of a screenshot.
    const textResult = await extractRegionText();
    if (textResult) {
      // Put the raw text on the system clipboard.
      try {
        await navigator.clipboard.writeText(textResult.text);
      } catch {
        // Clipboard may be blocked (permissions/insecure context) — ignore;
        // the placed TextAnnotation is still the primary deliverable.
      }
      const id = makeId();
      const a: TextAnnotation = {
        id,
        kind: 'text',
        pageIndex,
        x: regionRect.x + 24,
        y: regionRect.y + 24,
        text: textResult.text,
        fontSize: Math.max(8, Math.min(72, Math.round(textResult.fontSize))),
        colorHex: textColorHex,
        width: regionRect.width,
        bold: textBold,
        italic: textItalic,
        underline: textUnderline,
        fontFamily: textFontFamily,
        alignment: textAlignment,
      };
      addAnnotation(a);
      setSelected(id);
      setRegionRect(null);
      useEditStore.getState().setTool('select');
      showRegionNotice(t('tools.edit.regionTextCopied'));
      return;
    }

    // No meaningful text → fall back to a crisp hi-res image capture.
    const extracted = await extractRegionImage();
    if (!extracted) return;
    const id = makeId();
    const a: ImageAnnotation = {
      id,
      kind: 'image',
      pageIndex,
      x: regionRect.x + 24,
      y: regionRect.y + 24,
      width: regionRect.width,
      height: regionRect.height,
      dataUrl: extracted.dataUrl,
      mimeType: 'image/png',
      fileBlob: extracted.blob,
    };
    addAnnotation(a);
    setSelected(id);
    setRegionRect(null);
    useEditStore.getState().setTool('select');
  }, [
    regionRect,
    extractRegionText,
    extractRegionImage,
    addAnnotation,
    pageIndex,
    setSelected,
    setRegionRect,
    textColorHex,
    textBold,
    textItalic,
    textUnderline,
    textFontFamily,
    textAlignment,
    showRegionNotice,
    t,
  ]);

  const moveRegion = useCallback(async () => {
    if (!regionRect) return;
    const extracted = await extractRegionImage();
    if (!extracted) return;
    // Capture the geometry BEFORE clearing (copyRegion clears regionRect).
    const geom = { x: regionRect.x, y: regionRect.y, w: regionRect.width, h: regionRect.height };
    const imgId = makeId();
    const img: ImageAnnotation = {
      id: imgId,
      kind: 'image',
      pageIndex,
      // Move places the image at the SAME position as the region.
      x: geom.x,
      y: geom.y,
      width: geom.w,
      height: geom.h,
      dataUrl: extracted.dataUrl,
      mimeType: 'image/png',
      fileBlob: extracted.blob,
    };
    const coverId = makeId();
    const cover: RectAnnotation = {
      id: coverId,
      kind: 'rect',
      pageIndex,
      x: geom.x,
      y: geom.y,
      width: geom.w,
      height: geom.h,
      strokeHex: '#FFFFFF',
      fillHex: '#FFFFFF',
      strokeWidth: 0,
      opacity: 1,
    };
    // Add the cover first so the moved image (which the user will drag) sits
    // above it in Z-order.
    addAnnotation(cover);
    addAnnotation(img);
    setSelected(imgId);
    setRegionRect(null);
    useEditStore.getState().setTool('select');
  }, [regionRect, extractRegionImage, addAnnotation, pageIndex, setSelected, setRegionRect]);

  const hideRegion = useCallback(() => {
    if (!regionRect) return;
    const a: RectAnnotation = {
      id: makeId(),
      kind: 'rect',
      pageIndex,
      x: regionRect.x,
      y: regionRect.y,
      width: regionRect.width,
      height: regionRect.height,
      strokeHex: '#FFFFFF',
      fillHex: '#FFFFFF',
      strokeWidth: 0,
      opacity: 1,
    };
    addAnnotation(a);
    setRegionRect(null);
    useEditStore.getState().setTool('select');
  }, [regionRect, addAnnotation, pageIndex, setRegionRect]);

  const saveRegionAsImage = useCallback(async () => {
    const extracted = await extractRegionImage();
    if (!extracted) return;
    await downloadBlob(extracted.blob, 'region.png');
  }, [extractRegionImage]);

  // Attach the transformer to the region shape whenever the region rect is
  // present on the current page.
  useEffect(() => {
    if (!regionRect || regionRect.pageIndex !== pageIndex || regionDrafting) return;
    const tr = regionTransformerRef.current;
    const shape = regionShapeRef.current;
    if (tr && shape) {
      tr.nodes([shape]);
      tr.getLayer()?.batchDraw();
    }
  }, [regionRect, pageIndex, regionDrafting]);


  // ============ Keyboard shortcuts ============

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (inField) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        zoomIn();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        zoomReset();
        return;
      }

      // Copy / paste / duplicate — work even when nothing is selected for
      // "paste" (uses clipboard state directly). Duplicate needs a selection.
      const modKey = e.ctrlKey || e.metaKey;
      if (modKey && (e.key === 'c' || e.key === 'C')) {
        if (useEditStore.getState().selectedId) {
          e.preventDefault();
          copySelection();
        }
        return;
      }
      if (modKey && (e.key === 'v' || e.key === 'V')) {
        if (useEditStore.getState().clipboardAnnotation) {
          e.preventDefault();
          paste(pageIndex);
        }
        return;
      }
      if (modKey && (e.key === 'd' || e.key === 'D')) {
        if (useEditStore.getState().selectedId) {
          e.preventDefault();
          duplicateSelection();
        }
        return;
      }

      // Read latest state — the closure captures `selectedId` from the effect
      // dependency, but that can be stale mid-focus-transition. Reading from
      // the store guarantees the current selection.
      const currentSelectedId = useEditStore.getState().selectedId;
      if (!currentSelectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeAnnotation(currentSelectedId);
        return;
      }
      if (e.key === 'Escape') {
        setSelected(null);
        return;
      }
      const nudge = e.shiftKey ? 10 : 1;
      const current = useEditStore
        .getState()
        .annotations.find((a) => a.id === currentSelectedId);
      if (!current) return;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -nudge;
      else if (e.key === 'ArrowRight') dx = nudge;
      else if (e.key === 'ArrowUp') dy = -nudge;
      else if (e.key === 'ArrowDown') dy = nudge;
      else return;
      e.preventDefault();
      if (current.kind === 'line' || current.kind === 'arrow') {
        updateAnnotation(current.id, {
          x1: current.x1 + dx,
          y1: current.y1 + dy,
          x2: current.x2 + dx,
          y2: current.y2 + dy,
        });
      } else if (current.kind === 'freehand') {
        updateAnnotation(current.id, {
          points: current.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        });
      } else {
        updateAnnotation(current.id, {
          x: current.x + dx,
          y: current.y + dy,
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedId,
    removeAnnotation,
    updateAnnotation,
    setSelected,
    zoomIn,
    zoomOut,
    zoomReset,
    copySelection,
    paste,
    duplicateSelection,
    pageIndex,
  ]);

  const cursor = (() => {
    switch (currentTool) {
      case 'select':
        return 'default';
      case 'text':
        return 'text';
      case 'freehand':
      case 'highlight':
      case 'signature':
      case 'region':
        return 'crosshair';
      default:
        return 'crosshair';
    }
  })();

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Zoom toolbar */}
      <div className="flex items-center gap-1 rounded-full border border-black/10 bg-white px-1 py-1 shadow-sm">
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= ZOOM_LEVELS[0]}
          aria-label={t('common.zoomOut')}
          title={t('common.zoomOut')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted disabled:opacity-40"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={zoomReset}
          title={t('common.zoomReset')}
          className="min-w-[3.5rem] rounded-full px-2 py-1 text-xs font-medium text-ink hover:bg-surface-muted"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
          aria-label={t('common.zoomIn')}
          title={t('common.zoomIn')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted disabled:opacity-40"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="mx-1 h-4 w-px bg-black/10" />
        <button
          type="button"
          onClick={zoomFit}
          aria-label={t('common.zoomFit')}
          title={t('common.zoomFit')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted"
        >
          <Maximize className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative inline-block bg-white shadow-card"
        style={{ cursor }}
      >
        <canvas ref={backgroundCanvasRef} />
        <div
          ref={textLayerRef}
          className="pdfTextLayer absolute left-0 top-0"
          aria-hidden={currentTool !== 'select'}
          data-selectable={currentTool === 'select' ? 'true' : 'false'}
          style={{
            // Container is transparent to pointer events — only child spans
            // opt in via CSS when data-selectable="true". Clicks then fall
            // through to Konva when no span is under the cursor.
            pointerEvents: 'none',
            userSelect: currentTool === 'select' ? 'text' : 'none',
            // In Select mode, float the text layer ABOVE the Konva stage
            // (which is at zIndex 20) so text spans catch clicks while empty
            // areas fall through (container is pointer-events:none) to Konva
            // shapes below. In draw modes, keep it BELOW the stage so drawing
            // works and the (unselectable) text never intercepts anything.
            zIndex: currentTool === 'select' ? 25 : 15,
          }}
        />
        {pageSpace && editingAnnotation && (() => {
          const s = scaleFactor(pageSpace);
          const px = pdfToCanvas(pageSpace, editingAnnotation.x, editingAnnotation.y);
          const widthPt = editingAnnotation.width ?? DEFAULT_TEXT_WIDTH_PT;
          const heightPt = Math.max(
            DEFAULT_TEXT_HEIGHT_PT,
            editingAnnotation.fontSize * 1.6,
          );
          return (
            <textarea
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              defaultValue={editingAnnotation.text}
              placeholder={t('tools.edit.enterText')}
              onBlur={(e: ReactFocusEvent<HTMLTextAreaElement>) =>
                commitEditingText(e.currentTarget.value)
              }
              onKeyDown={(e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEditingText();
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commitEditingText(e.currentTarget.value);
                }
              }}
              style={{
                position: 'absolute',
                left: `${px.x}px`,
                top: `${px.y}px`,
                width: `${widthPt * s}px`,
                height: `${heightPt * s}px`,
                fontSize: `${editingAnnotation.fontSize * s}px`,
                color: editingAnnotation.colorHex,
                fontWeight: editingAnnotation.bold ? 700 : 400,
                fontStyle: editingAnnotation.italic ? 'italic' : 'normal',
                textDecoration: editingAnnotation.underline ? 'underline' : 'none',
                textAlign: editingAnnotation.alignment ?? 'left',
                border: '2px dashed rgba(10, 102, 255, 0.6)',
                background: 'rgba(255, 255, 255, 0.98)',
                padding: '8px 10px',
                outline: 'none',
                resize: 'both',
                overflow: 'auto',
                fontFamily: `${editingAnnotation.fontFamily ?? 'Helvetica'}, Arial, sans-serif`,
                lineHeight: '1.3',
                zIndex: 30,
                boxShadow:
                  '0 4px 12px rgba(0,0,0,0.08), 0 0 0 4px rgba(10,102,255,0.08)',
                borderRadius: '6px',
              }}
            />
          );
        })()}
        {pageSpace && selectedId && !editingTextId && (() => {
          // Mini action toolbar anchored to the top-right of the selected shape.
          const sel = pageAnnotations.find((a) => a.id === selectedId);
          if (!sel) return null;
          let anchorX = 0;
          let anchorY = 0;
          if (
            sel.kind === 'text' ||
            sel.kind === 'rect' ||
            sel.kind === 'ellipse' ||
            sel.kind === 'highlight' ||
            sel.kind === 'image'
          ) {
            const w = 'width' in sel ? sel.width ?? 0 : 0;
            const p = pdfToCanvas(pageSpace, sel.x + w, sel.y);
            anchorX = p.x;
            anchorY = p.y;
          } else if (sel.kind === 'line' || sel.kind === 'arrow') {
            const p = pdfToCanvas(
              pageSpace,
              Math.max(sel.x1, sel.x2),
              Math.min(sel.y1, sel.y2),
            );
            anchorX = p.x;
            anchorY = p.y;
          } else if (sel.kind === 'freehand') {
            const xs = sel.points.map((pt) => pt.x);
            const ys = sel.points.map((pt) => pt.y);
            const p = pdfToCanvas(
              pageSpace,
              Math.max(...xs),
              Math.min(...ys),
            );
            anchorX = p.x;
            anchorY = p.y;
          }
          const isText = sel.kind === 'text';
          // Clamp: if the shape is too near the top of the page, drop the
          // toolbar BELOW the anchor rather than above it (otherwise it gets
          // clipped by the page edge).
          const preferBelow = anchorY < 44;
          const toolbarTop = preferBelow
            ? anchorY + 12
            : Math.max(4, anchorY - 44);
          const buttonClass =
            'flex h-9 w-9 items-center justify-center rounded-full border border-black/20 bg-white shadow-lg transition-colors hover:bg-surface-muted';
          return (
            <div
              className="absolute z-50 flex items-center gap-1.5 rounded-full border-2 border-brand-500 bg-white px-2 py-1.5 shadow-2xl"
              onMouseDown={(e) => {
                // Prevent the stage from getting the click (which would deselect).
                e.stopPropagation();
              }}
              style={{
                left: `${Math.max(4, anchorX + 4)}px`,
                top: `${toolbarTop}px`,
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateSelection();
                }}
                title={t('tools.edit.duplicateSelected')}
                aria-label={t('tools.edit.duplicateSelected')}
                className={`${buttonClass} text-ink-muted`}
              >
                <Copy className="h-4 w-4" />
              </button>
              {isText && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTextId(sel.id);
                  }}
                  title={t('tools.edit.editSelected')}
                  aria-label={t('tools.edit.editSelected')}
                  className={`${buttonClass} text-ink-muted`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAnnotation(selectedId);
                }}
                title={t('tools.edit.deleteSelected')}
                aria-label={t('tools.edit.deleteSelected')}
                className={`${buttonClass} border-red-200 text-red-600 hover:bg-red-50`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })()}
        {pageSpace &&
          regionRect &&
          regionRect.pageIndex === pageIndex &&
          !regionDrafting && (() => {
            const anchor = pdfToCanvas(pageSpace, regionRect.x + regionRect.width, regionRect.y);
            const preferBelow = anchor.y < 60;
            const toolbarTop = preferBelow ? anchor.y + 16 : Math.max(4, anchor.y - 56);
            const buttonBase =
              'flex h-11 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 text-xs font-medium shadow-lg transition-colors hover:bg-surface-muted';
            return (
              <>
                <div
                  className="absolute z-50 flex items-center gap-1.5 rounded-full border-2 border-brand-500 bg-white px-2 py-1.5 shadow-2xl"
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    left: `${Math.max(4, anchor.x + 8)}px`,
                    top: `${toolbarTop}px`,
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void copyRegion();
                    }}
                    title={t('tools.edit.regionCopy')}
                    aria-label={t('tools.edit.regionCopy')}
                    className={`${buttonBase} text-ink`}
                  >
                    <Copy className="h-4 w-4" />
                    <span>{t('tools.edit.regionCopy')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void moveRegion();
                    }}
                    title={t('tools.edit.regionMove')}
                    aria-label={t('tools.edit.regionMove')}
                    className={`${buttonBase} text-ink`}
                  >
                    <Move className="h-4 w-4" />
                    <span>{t('tools.edit.regionMove')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      hideRegion();
                    }}
                    title={t('tools.edit.regionHide')}
                    aria-label={t('tools.edit.regionHide')}
                    className={`${buttonBase} text-ink`}
                  >
                    <EyeOff className="h-4 w-4" />
                    <span>{t('tools.edit.regionHide')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void saveRegionAsImage();
                    }}
                    title={t('tools.edit.regionSave')}
                    aria-label={t('tools.edit.regionSave')}
                    className={`${buttonBase} text-ink`}
                  >
                    <Download className="h-4 w-4" />
                    <span>{t('tools.edit.regionSave')}</span>
                  </button>
                </div>
              </>
            );
          })()}
        {pageSpace &&
          currentTool === 'region' &&
          !regionRect && (
            <div
              className="pointer-events-none absolute left-1/2 top-2 z-40 -translate-x-1/2 rounded-full border border-brand-500/40 bg-white/95 px-3 py-1 text-xs text-ink-muted shadow-sm"
            >
              {t('tools.edit.regionHint')}
            </div>
          )}
        {regionNotice && (
          <div
            className="pointer-events-none absolute left-1/2 top-2 z-[60] -translate-x-1/2 rounded-full border border-brand-500/40 bg-ink px-3 py-1 text-xs font-medium text-white shadow-lg"
            role="status"
          >
            {regionNotice}
          </div>
        )}
        {pageSpace && (
          <div
            className="absolute inset-0"
            style={{
              width: pageSpace.canvasWidth,
              height: pageSpace.canvasHeight,
              // Konva Stage container. Always sits above the pdf.js text
              // layer so shape clicks work reliably. Pointer events pass
              // through to layers below when no shape is hit — Konva's own
              // hit detection handles this.
              zIndex: 20,
            }}
          >
            <Stage
              ref={stageRef}
              width={pageSpace.canvasWidth}
              height={pageSpace.canvasHeight}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseUp={handleStageMouseUp}
            >
              <Layer>
                {pageAnnotations.map((a) => {
                  const isSelected = a.id === selectedId;
                  const onSelect = () => setSelected(a.id);
                  const onChange = (patch: AnnotationPatch) =>
                    updateAnnotation(a.id, patch);
                  switch (a.kind) {
                    case 'text':
                      return (
                        <TextLayer
                          key={a.id}
                          annotation={a}
                          isSelected={isSelected}
                          onSelect={onSelect}
                          onChange={(p) => updateAnnotation(a.id, p)}
                          onRequestEdit={() => setEditingTextId(a.id)}
                          pageSpace={pageSpace}
                        />
                      );
                    case 'rect':
                    case 'ellipse':
                    case 'line':
                    case 'arrow':
                      return (
                        <ShapeLayer
                          key={a.id}
                          annotation={a}
                          isSelected={isSelected}
                          onSelect={onSelect}
                          onChange={onChange}
                          pageSpace={pageSpace}
                        />
                      );
                    case 'freehand':
                      return (
                        <FreehandLayer
                          key={a.id}
                          annotation={a}
                          isSelected={isSelected}
                          onSelect={onSelect}
                          onChange={(p) => updateAnnotation(a.id, p)}
                          pageSpace={pageSpace}
                        />
                      );
                    case 'image':
                      return (
                        <ImageLayer
                          key={a.id}
                          annotation={a}
                          isSelected={isSelected}
                          onSelect={onSelect}
                          onChange={(p) => updateAnnotation(a.id, p)}
                          pageSpace={pageSpace}
                        />
                      );
                    case 'highlight':
                      return (
                        <HighlightLayer
                          key={a.id}
                          annotation={a}
                          isSelected={isSelected}
                          onSelect={onSelect}
                          onChange={(p) => updateAnnotation(a.id, p)}
                          pageSpace={pageSpace}
                        />
                      );
                    default:
                      return null;
                  }
                })}
                {regionRect && regionRect.pageIndex === pageIndex && pageSpace && (() => {
                  const s = scaleFactor(pageSpace);
                  const px = pdfToCanvas(pageSpace, regionRect.x, regionRect.y);
                  const rw = regionRect.width * s;
                  const rh = regionRect.height * s;
                  return (
                    <>
                      <KonvaRect
                        ref={regionShapeRef}
                        x={px.x}
                        y={px.y}
                        width={rw}
                        height={rh}
                        stroke="#0A66FF"
                        strokeWidth={3}
                        dash={[8, 4]}
                        fill="rgba(10, 102, 255, 0.1)"
                        draggable={!regionDrafting}
                        onDragEnd={(e) => {
                          const nx = e.target.x();
                          const ny = e.target.y();
                          const pdfPos = canvasToPdf(pageSpace, nx, ny);
                          setRegionRect({
                            x: pdfPos.x,
                            y: pdfPos.y,
                            width: regionRect.width,
                            height: regionRect.height,
                            pageIndex,
                          });
                        }}
                        onTransformEnd={() => {
                          const node = regionShapeRef.current;
                          if (!node) return;
                          const sx = node.scaleX();
                          const sy = node.scaleY();
                          node.scaleX(1);
                          node.scaleY(1);
                          const newW = Math.max(4, rw * sx);
                          const newH = Math.max(4, rh * sy);
                          const pdfPos = canvasToPdf(pageSpace, node.x(), node.y());
                          setRegionRect({
                            x: pdfPos.x,
                            y: pdfPos.y,
                            width: newW / s,
                            height: newH / s,
                            pageIndex,
                          });
                        }}
                      />
                      {/* Only show handles once the user has released the
                          initial drag — otherwise Konva's transformer visually
                          fights with the drag-to-draw gesture. */}
                      {!regionDrafting && (
                        <Transformer
                          ref={regionTransformerRef}
                          rotateEnabled={false}
                          anchorSize={12}
                          anchorStroke="#0A66FF"
                          anchorFill="#FFFFFF"
                          anchorCornerRadius={3}
                          borderStroke="#0A66FF"
                          boundBoxFunc={(oldBox, newBox) => {
                            if (newBox.width < 10 || newBox.height < 10) return oldBox;
                            return newBox;
                          }}
                        />
                      )}
                    </>
                  );
                })()}
              </Layer>
            </Stage>
          </div>
        )}
      </div>
    </div>
  );
}

export default EditCanvas;
