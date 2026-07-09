import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUpRight,
  Bold,
  BoxSelect,
  Circle,
  Highlighter,
  ImageIcon,
  Italic,
  Link2,
  Minus,
  MousePointer2,
  Pen,
  PenTool,
  Redo2,
  Square,
  Sparkles,
  StickyNote,
  Star,
  Trash2,
  Type,
  Underline,
  Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useToast } from '@/hooks/useToast';
import { useEditStore, type EditToolKind } from './useEditStore';
import type {
  Annotation,
  HighlightAnnotation,
  ImageAnnotation,
  TextAlignment,
  TextAnnotation,
  TextFontFamily,
} from './annotationTypes';
import { SignatureModal } from './SignatureModal';
import { StickerLibrary, makeStickerAsset, type StickerDef } from './StickerLibrary';
import { SymbolPicker } from './SymbolPicker';

interface Props {
  currentPageIndex: number;
  mode: 'annotate' | 'edit';
}

interface ToolDef {
  key: EditToolKind | 'delete' | 'undo' | 'redo' | 'image';
  icon: LucideIcon;
  labelKey: string;
}

const TOOL_ROW: ToolDef[] = [
  { key: 'select', icon: MousePointer2, labelKey: 'tools.edit.toolSelect' },
  { key: 'region', icon: BoxSelect, labelKey: 'tools.edit.toolRegion' },
  { key: 'text', icon: Type, labelKey: 'tools.edit.toolText' },
  { key: 'rect', icon: Square, labelKey: 'tools.edit.toolRect' },
  { key: 'ellipse', icon: Circle, labelKey: 'tools.edit.toolCircle' },
  { key: 'line', icon: Minus, labelKey: 'tools.edit.toolLine' },
  { key: 'arrow', icon: ArrowUpRight, labelKey: 'tools.edit.toolArrow' },
  { key: 'freehand', icon: Pen, labelKey: 'tools.edit.toolFreehand' },
  { key: 'highlight', icon: Highlighter, labelKey: 'tools.edit.toolHighlight' },
  { key: 'signature', icon: PenTool, labelKey: 'tools.edit.toolSignature' },
  { key: 'image', icon: ImageIcon, labelKey: 'tools.edit.toolImage' },
];

/** Fallback page size used only if no page has rendered yet (US Letter). */
const FALLBACK_PAGE_WIDTH_PT = 612;
const FALLBACK_PAGE_HEIGHT_PT = 792;

/** Physical size (in PDF points) that a sticker is placed at. */
const STICKER_TARGET_WIDTH_PT = 200;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function loadImageSize(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to read image dimensions.'));
    img.src = dataUrl;
  });
}

export function EditToolbar({ currentPageIndex, mode }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stickerBtnRef = useRef<HTMLButtonElement | null>(null);
  const symbolBtnRef = useRef<HTMLButtonElement | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [symbolOpen, setSymbolOpen] = useState(false);

  const currentTool = useEditStore((s) => s.currentTool);
  const setTool = useEditStore((s) => s.setTool);
  const selectedId = useEditStore((s) => s.selectedId);
  const annotations = useEditStore((s) => s.annotations);
  const removeAnnotation = useEditStore((s) => s.removeAnnotation);
  const undo = useEditStore((s) => s.undo);
  const redo = useEditStore((s) => s.redo);
  const past = useEditStore((s) => s.past);
  const future = useEditStore((s) => s.future);
  const addAnnotation = useEditStore((s) => s.addAnnotation);
  const setSelected = useEditStore((s) => s.setSelected);
  const savedSignatureDataUrl = useEditStore((s) => s.savedSignatureDataUrl);

  const strokeHex = useEditStore((s) => s.strokeHex);
  const setStrokeHex = useEditStore((s) => s.setStrokeHex);
  const fillHex = useEditStore((s) => s.fillHex);
  const setFillHex = useEditStore((s) => s.setFillHex);
  const strokeWidth = useEditStore((s) => s.strokeWidth);
  const setStrokeWidth = useEditStore((s) => s.setStrokeWidth);
  const fontSize = useEditStore((s) => s.fontSize);
  const setFontSize = useEditStore((s) => s.setFontSize);
  const opacity = useEditStore((s) => s.opacity);
  const setOpacity = useEditStore((s) => s.setOpacity);
  const textColorHex = useEditStore((s) => s.textColorHex);
  const setTextColorHex = useEditStore((s) => s.setTextColorHex);
  const highlightHex = useEditStore((s) => s.highlightHex);
  const setHighlightHex = useEditStore((s) => s.setHighlightHex);
  const textBold = useEditStore((s) => s.textBold);
  const setTextBold = useEditStore((s) => s.setTextBold);
  const textItalic = useEditStore((s) => s.textItalic);
  const setTextItalic = useEditStore((s) => s.setTextItalic);
  const textUnderline = useEditStore((s) => s.textUnderline);
  const setTextUnderline = useEditStore((s) => s.setTextUnderline);
  const textFontFamily = useEditStore((s) => s.textFontFamily);
  const setTextFontFamily = useEditStore((s) => s.setTextFontFamily);
  const textAlignment = useEditStore((s) => s.textAlignment);
  const setTextAlignment = useEditStore((s) => s.setTextAlignment);
  const updateAnnotation = useEditStore((s) => s.updateAnnotation);

  const selectedAnnotation = selectedId
    ? annotations.find((a) => a.id === selectedId)
    : null;

  const selectedText: TextAnnotation | null =
    selectedAnnotation && selectedAnnotation.kind === 'text'
      ? selectedAnnotation
      : null;

  // When a text annotation is selected, the toolbar reflects its properties;
  // otherwise it reflects the "next text to create" defaults in the store.
  const currentFontSize = selectedText?.fontSize ?? fontSize;
  const currentTextColor = selectedText?.colorHex ?? textColorHex;
  const currentBold = selectedText?.bold ?? textBold;
  const currentItalic = selectedText?.italic ?? textItalic;
  const currentUnderline = selectedText?.underline ?? textUnderline;
  const currentFontFamily: TextFontFamily =
    selectedText?.fontFamily ?? textFontFamily;
  const currentAlignment: TextAlignment =
    selectedText?.alignment ?? textAlignment;

  const applyFontSize = (v: number) => {
    setFontSize(v);
    if (selectedText) updateAnnotation(selectedText.id, { fontSize: v });
  };
  const applyTextColor = (v: string) => {
    setTextColorHex(v);
    if (selectedText) updateAnnotation(selectedText.id, { colorHex: v });
  };
  const applyBold = (v: boolean) => {
    setTextBold(v);
    if (selectedText) updateAnnotation(selectedText.id, { bold: v });
  };
  const applyItalic = (v: boolean) => {
    setTextItalic(v);
    if (selectedText) updateAnnotation(selectedText.id, { italic: v });
  };
  const applyUnderline = (v: boolean) => {
    setTextUnderline(v);
    if (selectedText) updateAnnotation(selectedText.id, { underline: v });
  };
  const applyFontFamily = (v: TextFontFamily) => {
    setTextFontFamily(v);
    if (selectedText) updateAnnotation(selectedText.id, { fontFamily: v });
  };
  const applyAlignment = (v: TextAlignment) => {
    setTextAlignment(v);
    if (selectedText) updateAnnotation(selectedText.id, { alignment: v });
  };

  const showStrokeStyle =
    currentTool === 'rect' ||
    currentTool === 'ellipse' ||
    currentTool === 'line' ||
    currentTool === 'arrow' ||
    currentTool === 'freehand' ||
    (currentTool === 'select' &&
      !!selectedAnnotation &&
      selectedAnnotation.kind !== 'text' &&
      selectedAnnotation.kind !== 'image' &&
      selectedAnnotation.kind !== 'highlight');

  const showFill =
    currentTool === 'rect' ||
    currentTool === 'ellipse' ||
    (currentTool === 'select' &&
      (selectedAnnotation?.kind === 'rect' ||
        selectedAnnotation?.kind === 'ellipse'));

  const showFont =
    currentTool === 'text' ||
    (currentTool === 'select' && selectedAnnotation?.kind === 'text');

  const showHighlightColor =
    currentTool === 'highlight' ||
    (currentTool === 'select' && selectedAnnotation?.kind === 'highlight');

  const showOpacity =
    currentTool === 'rect' ||
    currentTool === 'ellipse' ||
    currentTool === 'line' ||
    currentTool === 'arrow' ||
    currentTool === 'freehand' ||
    (currentTool === 'select' &&
      !!selectedAnnotation &&
      selectedAnnotation.kind !== 'text' &&
      selectedAnnotation.kind !== 'image' &&
      selectedAnnotation.kind !== 'highlight');

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const canDelete = selectedId !== null;

  const handleClickTool = (key: ToolDef['key']) => {
    if (key === 'image') {
      fileInputRef.current?.click();
      return;
    }
    if (key === 'signature') {
      // Open the modal if there's no signature yet, or if the signature tool
      // is already active (click-again to redraw). Otherwise activate the tool
      // so the next PDF click places the saved signature.
      if (!savedSignatureDataUrl || currentTool === 'signature') {
        setSignatureModalOpen(true);
        return;
      }
      setTool('signature');
      return;
    }
    setTool(key as EditToolKind);
  };

  const handlePickImage = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      toast({ message: t('tools.edit.imageTypeError'), variant: 'error' });
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    const { width, height } = await loadImageSize(dataUrl);
    // Place at ~1/3 of a US-letter page, aspect-preserved.
    const targetWidthPts = 200;
    const aspect = height / Math.max(1, width);
    const id = makeId();
    const img: ImageAnnotation = {
      id,
      kind: 'image',
      pageIndex: currentPageIndex,
      x: 50,
      y: 50,
      width: targetWidthPts,
      height: targetWidthPts * aspect,
      dataUrl,
      mimeType: file.type as 'image/png' | 'image/jpeg',
      fileBlob: file,
    };
    addAnnotation(img);
    setSelected(id);
    setTool('select');
  };

  /** Reads the current page size from the store, falling back to US Letter. */
  const currentPageDims = (): { width: number; height: number } => {
    const s = useEditStore.getState();
    const w = s.currentPageWidth > 0 ? s.currentPageWidth : FALLBACK_PAGE_WIDTH_PT;
    const h = s.currentPageHeight > 0 ? s.currentPageHeight : FALLBACK_PAGE_HEIGHT_PT;
    return { width: w, height: h };
  };

  const placeAtCenter = (a: Annotation) => {
    addAnnotation(a);
    setSelected(a.id);
    setTool('select');
  };

  const handlePickSticker = async (def: StickerDef) => {
    const asset = await makeStickerAsset(def);
    const { width: pageW, height: pageH } = currentPageDims();
    const aspect = asset.height / Math.max(1, asset.width);
    const w = STICKER_TARGET_WIDTH_PT;
    const h = w * aspect;
    const id = makeId();
    const a: ImageAnnotation = {
      id,
      kind: 'image',
      pageIndex: currentPageIndex,
      x: (pageW - w) / 2,
      y: (pageH - h) / 2,
      width: w,
      height: h,
      dataUrl: asset.dataUrl,
      mimeType: 'image/png',
      fileBlob: asset.blob,
    };
    placeAtCenter(a);
  };

  const handlePickSymbol = (symbol: string) => {
    const { width: pageW, height: pageH } = currentPageDims();
    const size = 48;
    // Approximate width so the annotation lands centered on the page.
    const widthGuess = size * 1.5;
    const id = makeId();
    const a: TextAnnotation = {
      id,
      kind: 'text',
      pageIndex: currentPageIndex,
      x: (pageW - widthGuess) / 2,
      y: (pageH - size) / 2,
      text: symbol,
      fontSize: size,
      colorHex: textColorHex,
      width: widthGuess,
      bold: false,
      italic: false,
      underline: false,
      fontFamily: 'Helvetica',
      alignment: 'center',
    };
    placeAtCenter(a);
  };

  /** Note (callout) = a yellow highlight rectangle + a text label on top. */
  const handleAddNote = () => {
    const { width: pageW, height: pageH } = currentPageDims();
    const w = 240;
    const h = 90;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    const highlight: HighlightAnnotation = {
      id: makeId(),
      kind: 'highlight',
      pageIndex: currentPageIndex,
      x,
      y,
      width: w,
      height: h,
      colorHex: '#FEF08A',
    };
    const textId = makeId();
    const label: TextAnnotation = {
      id: textId,
      kind: 'text',
      pageIndex: currentPageIndex,
      x: x + 10,
      y: y + 10,
      text: 'Note',
      fontSize: 18,
      colorHex: '#111111',
      width: w - 20,
      bold: false,
      italic: false,
      underline: false,
      fontFamily: 'Helvetica',
      alignment: 'left',
    };
    addAnnotation(highlight);
    addAnnotation(label);
    setSelected(textId);
    setTool('select');
  };

  const handleAddLink = () => {
    const { width: pageW, height: pageH } = currentPageDims();
    const size = 20;
    const w = 200;
    const id = makeId();
    const a: TextAnnotation = {
      id,
      kind: 'text',
      pageIndex: currentPageIndex,
      x: (pageW - w) / 2,
      y: (pageH - size) / 2,
      text: 'https://example.com',
      fontSize: size,
      colorHex: '#1D4ED8',
      width: w,
      bold: false,
      italic: false,
      underline: true,
      fontFamily: 'Helvetica',
      alignment: 'left',
    };
    placeAtCenter(a);
  };

  const renderAnnotateTools = () => (
    <div className="flex items-center gap-1">
      {TOOL_ROW.map((def) => {
        const Icon = def.icon;
        const isActive = def.key !== 'image' && def.key === currentTool;
        return (
          <button
            key={def.key}
            type="button"
            title={t(def.labelKey)}
            aria-label={t(def.labelKey)}
            aria-pressed={isActive}
            onClick={() => handleClickTool(def.key)}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-button transition-colors',
              isActive
                ? 'bg-brand-500 text-white'
                : 'text-ink-muted hover:bg-surface-muted',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );

  const renderEditTools = () => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title={t('tools.edit.toolSelect')}
        aria-label={t('tools.edit.toolSelect')}
        aria-pressed={currentTool === 'select'}
        onClick={() => setTool('select')}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-button transition-colors',
          currentTool === 'select'
            ? 'bg-brand-500 text-white'
            : 'text-ink-muted hover:bg-surface-muted',
        )}
      >
        <MousePointer2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        title={t('tools.edit.toolRegion')}
        aria-label={t('tools.edit.toolRegion')}
        aria-pressed={currentTool === 'region'}
        onClick={() => setTool('region')}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-button transition-colors',
          currentTool === 'region'
            ? 'bg-brand-500 text-white'
            : 'text-ink-muted hover:bg-surface-muted',
        )}
      >
        <BoxSelect className="h-4 w-4" />
      </button>
      <button
        type="button"
        title={t('tools.edit.toolText')}
        aria-label={t('tools.edit.toolText')}
        aria-pressed={currentTool === 'text'}
        onClick={() => setTool('text')}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-button transition-colors',
          currentTool === 'text'
            ? 'bg-brand-500 text-white'
            : 'text-ink-muted hover:bg-surface-muted',
        )}
      >
        <Type className="h-4 w-4" />
      </button>

      {/* Sticker */}
      <div className="relative">
        <button
          ref={stickerBtnRef}
          type="button"
          title={t('tools.edit.stickerLabel')}
          aria-label={t('tools.edit.stickerLabel')}
          aria-pressed={stickerOpen}
          onClick={() => {
            setStickerOpen((v) => !v);
            setSymbolOpen(false);
          }}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-button transition-colors',
            stickerOpen
              ? 'bg-brand-500 text-white'
              : 'text-ink-muted hover:bg-surface-muted',
          )}
        >
          <Sparkles className="h-4 w-4" />
        </button>
        <StickerLibrary
          open={stickerOpen}
          onClose={() => setStickerOpen(false)}
          onPick={(def) => {
            void handlePickSticker(def);
          }}
          anchorRef={stickerBtnRef}
        />
      </div>

      {/* Note (callout) */}
      <button
        type="button"
        title={t('tools.edit.noteLabel')}
        aria-label={t('tools.edit.noteLabel')}
        onClick={handleAddNote}
        className="flex h-9 w-9 items-center justify-center rounded-button text-ink-muted transition-colors hover:bg-surface-muted"
      >
        <StickyNote className="h-4 w-4" />
      </button>

      {/* Symbol */}
      <div className="relative">
        <button
          ref={symbolBtnRef}
          type="button"
          title={t('tools.edit.symbolLabel')}
          aria-label={t('tools.edit.symbolLabel')}
          aria-pressed={symbolOpen}
          onClick={() => {
            setSymbolOpen((v) => !v);
            setStickerOpen(false);
          }}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-button transition-colors',
            symbolOpen
              ? 'bg-brand-500 text-white'
              : 'text-ink-muted hover:bg-surface-muted',
          )}
        >
          <Star className="h-4 w-4" />
        </button>
        <SymbolPicker
          open={symbolOpen}
          onClose={() => setSymbolOpen(false)}
          onPick={handlePickSymbol}
          anchorRef={symbolBtnRef}
        />
      </div>

      {/* Link */}
      <button
        type="button"
        title={t('tools.edit.linkTooltip')}
        aria-label={t('tools.edit.linkLabel')}
        onClick={handleAddLink}
        className="flex h-9 w-9 items-center justify-center rounded-button text-ink-muted transition-colors hover:bg-surface-muted"
      >
        <Link2 className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-black/10 bg-white p-2 shadow-card">
      {mode === 'annotate' ? renderAnnotateTools() : renderEditTools()}

      <div className="mx-1 h-6 w-px bg-black/10" />

      {/* Undo / redo / delete */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          title={t('tools.edit.undo')}
          aria-label={t('tools.edit.undo')}
          onClick={undo}
          disabled={!canUndo}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-button transition-colors',
            canUndo
              ? 'text-ink-muted hover:bg-surface-muted'
              : 'text-ink-muted/40',
          )}
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={t('tools.edit.redo')}
          aria-label={t('tools.edit.redo')}
          onClick={redo}
          disabled={!canRedo}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-button transition-colors',
            canRedo
              ? 'text-ink-muted hover:bg-surface-muted'
              : 'text-ink-muted/40',
          )}
        >
          <Redo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={t('tools.edit.deleteSelected')}
          aria-label={t('tools.edit.deleteSelected')}
          onClick={() => {
            if (selectedId) removeAnnotation(selectedId);
          }}
          disabled={!canDelete}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-button transition-colors',
            canDelete
              ? 'text-red-600 hover:bg-red-50'
              : 'text-ink-muted/40',
          )}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-1 h-6 w-px bg-black/10" />

      {/* Contextual style controls */}
      <div className="flex flex-1 flex-wrap items-center gap-3 text-xs text-ink-muted">
        {showFont && (
          <>
            <label className="flex items-center gap-1">
              <span>{t('tools.edit.fontFamily')}</span>
              <select
                value={currentFontFamily}
                onChange={(e) =>
                  applyFontFamily(e.target.value as TextFontFamily)
                }
                className="h-7 rounded border border-black/10 bg-white px-1 text-xs text-ink"
              >
                <option value="Helvetica">Helvetica</option>
                <option value="Times">Times</option>
                <option value="Courier">Courier</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span>{t('tools.edit.fontSize')}</span>
              <input
                type="number"
                min={8}
                max={96}
                step={1}
                value={currentFontSize}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  const clamped = Math.min(96, Math.max(8, Math.round(n)));
                  applyFontSize(clamped);
                }}
                className="h-7 w-14 rounded border border-black/10 bg-white px-1 text-right text-xs text-ink"
              />
            </label>
            <label className="flex items-center gap-1">
              <span>{t('tools.edit.strokeColor')}</span>
              <input
                type="color"
                value={currentTextColor}
                onChange={(e) => applyTextColor(e.target.value)}
                className="h-7 w-9 cursor-pointer rounded border border-black/10 bg-white"
              />
            </label>
            <div className="flex items-center gap-0.5 rounded border border-black/10 bg-white p-0.5">
              <button
                type="button"
                title={t('tools.edit.bold')}
                aria-label={t('tools.edit.bold')}
                aria-pressed={currentBold}
                onClick={() => applyBold(!currentBold)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded transition-colors',
                  currentBold
                    ? 'bg-brand-500 text-white'
                    : 'text-ink-muted hover:bg-surface-muted',
                )}
              >
                <Bold className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={t('tools.edit.italic')}
                aria-label={t('tools.edit.italic')}
                aria-pressed={currentItalic}
                onClick={() => applyItalic(!currentItalic)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded transition-colors',
                  currentItalic
                    ? 'bg-brand-500 text-white'
                    : 'text-ink-muted hover:bg-surface-muted',
                )}
              >
                <Italic className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={t('tools.edit.underline')}
                aria-label={t('tools.edit.underline')}
                aria-pressed={currentUnderline}
                onClick={() => applyUnderline(!currentUnderline)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded transition-colors',
                  currentUnderline
                    ? 'bg-brand-500 text-white'
                    : 'text-ink-muted hover:bg-surface-muted',
                )}
              >
                <Underline className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-0.5 rounded border border-black/10 bg-white p-0.5">
              {(
                [
                  { key: 'left', Icon: AlignLeft, labelKey: 'tools.edit.alignLeft' },
                  {
                    key: 'center',
                    Icon: AlignCenter,
                    labelKey: 'tools.edit.alignCenter',
                  },
                  {
                    key: 'right',
                    Icon: AlignRight,
                    labelKey: 'tools.edit.alignRight',
                  },
                ] as const
              ).map(({ key, Icon, labelKey }) => {
                const active = currentAlignment === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={t(labelKey)}
                    aria-label={t(labelKey)}
                    aria-pressed={active}
                    onClick={() => applyAlignment(key)}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded transition-colors',
                      active
                        ? 'bg-brand-500 text-white'
                        : 'text-ink-muted hover:bg-surface-muted',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {showStrokeStyle && (
          <>
            <label className="flex items-center gap-1">
              <span>{t('tools.edit.strokeColor')}</span>
              <input
                type="color"
                value={strokeHex}
                onChange={(e) => setStrokeHex(e.target.value)}
                className="h-7 w-9 cursor-pointer rounded border border-black/10 bg-white"
              />
            </label>
            <label className="flex items-center gap-1">
              <span>
                {t('tools.edit.strokeWidth')} {strokeWidth}
              </span>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="accent-brand-500"
              />
            </label>
          </>
        )}

        {showFill && (
          <label className="flex items-center gap-1">
            <span>{t('tools.edit.fillColor')}</span>
            <input
              type="color"
              value={fillHex ?? '#ffffff'}
              onChange={(e) => setFillHex(e.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-black/10 bg-white"
              disabled={fillHex === null}
            />
            <button
              type="button"
              onClick={() => setFillHex(fillHex === null ? '#ffffff' : null)}
              className={cn(
                'rounded border border-black/10 px-2 py-0.5 text-[11px]',
                fillHex === null ? 'bg-surface-muted' : 'bg-white',
              )}
            >
              {fillHex === null ? 'off' : 'on'}
            </button>
          </label>
        )}

        {showHighlightColor && (
          <label className="flex items-center gap-1">
            <span>{t('tools.edit.strokeColor')}</span>
            <input
              type="color"
              value={highlightHex}
              onChange={(e) => setHighlightHex(e.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-black/10 bg-white"
            />
          </label>
        )}

        {showOpacity && (
          <label className="flex items-center gap-1">
            <span>
              {t('tools.edit.opacity')} {opacity.toFixed(2)}
            </span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="accent-brand-500"
            />
          </label>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          void handlePickImage(f);
          e.target.value = '';
        }}
      />

      <SignatureModal
        open={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        onSaved={() => setTool('signature')}
      />
    </div>
  );
}

export default EditToolbar;
