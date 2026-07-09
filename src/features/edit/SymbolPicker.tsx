import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PRESET_SYMBOLS: readonly string[] = [
  '★',
  '✓',
  '✗',
  '→',
  '←',
  '↑',
  '↓',
  '✎',
  '♥',
  '•',
  '▸',
  '▪',
];

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (symbol: string) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

/** Popup for choosing a symbol/emoji to insert as a text annotation. */
export function SymbolPicker({ open, onClose, onPick, anchorRef }: Props) {
  const { t } = useTranslation();
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [custom, setCustom] = useState('');

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

  useEffect(() => {
    if (!open) setCustom('');
  }, [open]);

  if (!open) return null;

  const commitCustom = () => {
    const v = custom.trim();
    if (!v) return;
    // Take the first grapheme so long strings don't sneak in as "symbols".
    const first = Array.from(v)[0] ?? v;
    onPick(first);
    onClose();
  };

  return (
    <div
      ref={popupRef}
      className="absolute z-40 mt-2 w-64 rounded-card border border-black/10 bg-white p-3 shadow-card"
    >
      <div className="mb-2 text-xs font-medium text-ink-muted">
        {t('tools.edit.symbolLabel')}
      </div>
      <div className="grid grid-cols-6 gap-1">
        {PRESET_SYMBOLS.map((sym) => (
          <button
            key={sym}
            type="button"
            onClick={() => {
              onPick(sym);
              onClose();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-button text-lg text-ink hover:bg-surface-muted"
            aria-label={sym}
            title={sym}
          >
            {sym}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitCustom();
            }
          }}
          placeholder={t('tools.edit.symbolCustom')}
          className="h-8 flex-1 rounded-button border border-black/10 bg-white px-2 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        />
        <button
          type="button"
          onClick={commitCustom}
          disabled={custom.trim().length === 0}
          className="h-8 rounded-button bg-brand-500 px-2 text-xs font-medium text-white disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default SymbolPicker;
