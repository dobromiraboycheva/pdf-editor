import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Stamp catalog — a handful of Acrobat-style status stamps.
 * `labelKey` drives the i18n string shown in the UI; `text` is the WYSIWYG
 * text baked into the rasterized stamp itself (kept English on purpose so
 * the resulting stamp reads the same regardless of app locale).
 */
export interface StickerDef {
  key: string;
  labelKey: string;
  text: string;
  bg: string;
  fg: string;
}

export const STICKERS: readonly StickerDef[] = [
  {
    key: 'approved',
    labelKey: 'tools.edit.stickerApproved',
    text: 'APPROVED',
    bg: '#10B981',
    fg: '#FFFFFF',
  },
  {
    key: 'rejected',
    labelKey: 'tools.edit.stickerRejected',
    text: 'REJECTED',
    bg: '#EF4444',
    fg: '#FFFFFF',
  },
  {
    key: 'draft',
    labelKey: 'tools.edit.stickerDraft',
    text: 'DRAFT',
    bg: '#F59E0B',
    fg: '#FFFFFF',
  },
  {
    key: 'paid',
    labelKey: 'tools.edit.stickerPaid',
    text: 'PAID',
    bg: '#3B82F6',
    fg: '#FFFFFF',
  },
  {
    key: 'confidential',
    labelKey: 'tools.edit.stickerConfidential',
    text: 'CONFIDENTIAL',
    bg: '#EF4444',
    fg: '#FFFFFF',
  },
  {
    key: 'urgent',
    labelKey: 'tools.edit.stickerUrgent',
    text: 'URGENT',
    bg: '#DC2626',
    fg: '#FFFFFF',
  },
];

const CANVAS_W = 400;
const CANVAS_H = 120;
const CORNER_R = 20;

/** Draws a stamp onto a fresh canvas. Caller owns the returned canvas. */
export function renderStickerCanvas(
  text: string,
  bg: string,
  fg: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Rounded-rect fill.
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(CORNER_R, 0);
  ctx.arcTo(CANVAS_W, 0, CANVAS_W, CANVAS_H, CORNER_R);
  ctx.arcTo(CANVAS_W, CANVAS_H, 0, CANVAS_H, CORNER_R);
  ctx.arcTo(0, CANVAS_H, 0, 0, CORNER_R);
  ctx.arcTo(0, 0, CANVAS_W, 0, CORNER_R);
  ctx.closePath();
  ctx.fill();

  // Inner border for the stamp look.
  ctx.strokeStyle = fg;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Label. Font size shrinks a bit for longer strings so CONFIDENTIAL fits.
  const size = text.length > 8 ? 44 : 56;
  ctx.fillStyle = fg;
  ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2);

  return canvas;
}

/** Rasterizes a sticker and returns both a data URL and a Blob. */
export async function makeStickerAsset(
  def: StickerDef,
): Promise<{ dataUrl: string; blob: Blob; width: number; height: number }> {
  const canvas = renderStickerCanvas(def.text, def.bg, def.fg);
  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to encode sticker.'));
    }, 'image/png');
  });
  return { dataUrl, blob, width: canvas.width, height: canvas.height };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (def: StickerDef) => void;
  /** Anchor for the popup so it appears aligned to the trigger button. */
  anchorRef: React.RefObject<HTMLElement | null>;
}

/** Small popup showing the sticker grid. Dismisses on outside click / Escape. */
export function StickerLibrary({ open, onClose, onPick, anchorRef }: Props) {
  const { t } = useTranslation();
  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popupRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={popupRef}
      className="absolute z-40 mt-2 w-72 rounded-card border border-black/10 bg-white p-3 shadow-card"
    >
      <div className="mb-2 text-xs font-medium text-ink-muted">
        {t('tools.edit.stickerLabel')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {STICKERS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              onPick(s);
              onClose();
            }}
            className="flex h-12 items-center justify-center rounded-button text-xs font-bold uppercase tracking-wide shadow-sm transition-transform hover:scale-[1.02]"
            style={{
              backgroundColor: s.bg,
              color: s.fg,
              border: `2px solid ${s.fg}`,
            }}
            aria-label={t(s.labelKey)}
            title={t(s.labelKey)}
          >
            {s.text}
          </button>
        ))}
      </div>
    </div>
  );
}

export default StickerLibrary;
