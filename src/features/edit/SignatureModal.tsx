import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { useEditStore } from './useEditStore';

type SigTab = 'draw' | 'type' | 'upload';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fired once a signature has been saved to the store. */
  onSaved?: () => void;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 240;

interface StagedSignature {
  dataUrl: string;
  blob: Blob;
}

export function SignatureModal({ open, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const setSignature = useEditStore((s) => s.setSignature);
  const clearSignature = useEditStore((s) => s.clearSignature);
  const savedSignatureDataUrl = useEditStore((s) => s.savedSignatureDataUrl);

  const [tab, setTab] = useState<SigTab>('draw');
  const [staged, setStaged] = useState<StagedSignature | null>(null);
  const [typedName, setTypedName] = useState('');

  // When opened, reset the staged buffer and default to Draw tab.
  useEffect(() => {
    if (!open) return;
    setStaged(null);
    setTab('draw');
    setTypedName('');
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSave = useCallback(() => {
    if (!staged) return;
    setSignature(staged.dataUrl, staged.blob);
    onSaved?.();
    onClose();
  }, [staged, setSignature, onSaved, onClose]);

  const handleRemoveSaved = useCallback(() => {
    clearSignature();
    setStaged(null);
  }, [clearSignature]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('tools.edit.signatureModalTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[680px] rounded-card border border-black/10 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            {t('tools.edit.signatureModalTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label={t('tools.edit.signatureModalTitle')}
          className="mb-4 grid grid-cols-3 gap-1 rounded-button border border-black/10 bg-white p-1"
        >
          {(['draw', 'type', 'upload'] as SigTab[]).map((tk) => {
            const selected = tab === tk;
            return (
              <button
                key={tk}
                role="tab"
                aria-selected={selected}
                type="button"
                onClick={() => {
                  setTab(tk);
                  setStaged(null);
                }}
                className={cn(
                  'h-9 rounded-button text-sm font-medium transition-colors',
                  selected
                    ? 'bg-brand-500 text-white'
                    : 'text-ink hover:bg-surface-muted',
                )}
              >
                {tk === 'draw'
                  ? t('tools.edit.signatureDrawTab')
                  : tk === 'type'
                    ? t('tools.edit.signatureTypeTab')
                    : t('tools.edit.signatureUploadTab')}
              </button>
            );
          })}
        </div>

        <div className="mb-4">
          {tab === 'draw' && (
            <SignatureDrawPad
              onStage={setStaged}
              clearLabel={t('tools.edit.signatureClear')}
            />
          )}
          {tab === 'type' && (
            <SignatureTypeInput
              value={typedName}
              onChange={setTypedName}
              placeholder={t('tools.edit.signatureTypePlaceholder')}
              onStage={setStaged}
              clearLabel={t('tools.edit.signatureClear')}
            />
          )}
          {tab === 'upload' && (
            <SignatureUploadInput
              onStage={setStaged}
              clearLabel={t('tools.edit.signatureClear')}
            />
          )}
        </div>

        {savedSignatureDataUrl && !staged && (
          <div className="mb-4 rounded-lg border border-black/10 bg-white p-2">
            <div className="mb-1 text-xs text-ink-muted">
              {t('tools.edit.signaturePlaceHint')}
            </div>
            <img
              src={savedSignatureDataUrl}
              alt="saved signature"
              className="max-h-24 w-full object-contain"
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div>
            {savedSignatureDataUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveSaved}
              >
                {t('common.remove')}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!staged}
            >
              {t('tools.edit.signatureSave')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- Signature input components (internal) --- */

interface StageFn {
  (staged: StagedSignature | null): void;
}

interface DrawPadProps {
  onStage: StageFn;
  clearLabel: string;
}

function SignatureDrawPad({ onStage, clearLabel }: DrawPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const hasInkRef = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPoint = (
    e: ReactPointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  };

  const commit = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((blob) => {
      if (!blob) return;
      onStage({ blob, dataUrl: c.toDataURL('image/png') });
    }, 'image/png');
  }, [onStage]);

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    c.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = getPoint(e);
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const c = canvasRef.current;
    const last = lastPoint.current;
    if (!c || !last) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    hasInkRef.current = true;
  };
  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    const c = canvasRef.current;
    if (!c) return;
    if (c.hasPointerCapture(e.pointerId)) {
      c.releasePointerCapture(e.pointerId);
    }
    if (!hasInkRef.current) return;
    commit();
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    hasInkRef.current = false;
    onStage(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="h-40 w-full touch-none rounded-lg border border-black/10 bg-white"
      />
      <Button type="button" variant="ghost" size="sm" onClick={clear}>
        {clearLabel}
      </Button>
    </div>
  );
}

interface TypeInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onStage: StageFn;
  clearLabel: string;
}

function SignatureTypeInput({
  value,
  onChange,
  placeholder,
  onStage,
  clearLabel,
}: TypeInputProps) {
  const onStageRef = useRef(onStage);
  useEffect(() => {
    onStageRef.current = onStage;
  }, [onStage]);

  useEffect(() => {
    if (!value.trim()) {
      onStageRef.current(null);
      return;
    }
    const c = document.createElement('canvas');
    c.width = CANVAS_WIDTH;
    c.height = CANVAS_HEIGHT;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#111827';
    ctx.font =
      'italic 96px "Dancing Script", "Segoe Script", "Bradley Hand", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, c.width / 2, c.height / 2);
    c.toBlob((blob) => {
      if (!blob) return;
      onStageRef.current({ blob, dataUrl: c.toDataURL('image/png') });
    }, 'image/png');
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-14 rounded-button border border-black/10 bg-white px-3 text-2xl italic text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        style={{
          fontFamily:
            '"Dancing Script", "Segoe Script", "Bradley Hand", cursive',
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange('')}
      >
        {clearLabel}
      </Button>
    </div>
  );
}

interface UploadProps {
  onStage: StageFn;
  clearLabel: string;
}

function SignatureUploadInput({ onStage, clearLabel }: UploadProps) {
  const [name, setName] = useState<string | null>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      onStage({ blob: f, dataUrl });
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        type="file"
        accept="image/*"
        onChange={onFile}
        className="text-sm text-ink file:mr-3 file:cursor-pointer file:rounded-button file:border-0 file:bg-brand-500 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600"
      />
      {name && (
        <span className="truncate text-xs text-ink-muted">{name}</span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setName(null);
          onStage(null);
        }}
      >
        {clearLabel}
      </Button>
    </div>
  );
}

export default SignatureModal;
