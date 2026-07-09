import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useToast, type Toast, type ToastVariant } from '@/hooks/useToast';
import { cn } from '@/lib/utils/cn';

const VARIANT_STYLES: Record<
  ToastVariant,
  { container: string; icon: LucideIcon; iconClass: string }
> = {
  error: {
    container: 'border-red-200 bg-red-50 text-red-900',
    icon: AlertCircle,
    iconClass: 'text-red-600',
  },
  success: {
    container: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: CheckCircle2,
    iconClass: 'text-emerald-600',
  },
  info: {
    container: 'border-black/10 bg-white text-ink',
    icon: Info,
    iconClass: 'text-ink-muted',
  },
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: number) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const { id, message, variant, duration } = toast;

  useEffect(() => {
    if (duration <= 0) return;
    const timer = window.setTimeout(() => onDismiss(id), duration);
    return () => window.clearTimeout(timer);
  }, [id, duration, onDismiss]);

  const styles = VARIANT_STYLES[variant];
  const Icon = styles.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-card border p-3 shadow-card',
        styles.container,
      )}
    >
      <Icon
        className={cn('mt-0.5 h-5 w-5 shrink-0', styles.iconClass)}
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 break-words text-sm font-medium">{message}</p>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Close"
        className="shrink-0 rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Global toast renderer. Mount once (in App.tsx). Reads from the zustand
 * `useToast` store and renders a bottom-right stack. Each toast auto-dismisses
 * after its `duration` (default 4s) and can be closed manually.
 */
export function Toaster() {
  const toasts = useToast((state) => state.toasts);
  const dismiss = useToast((state) => state.dismiss);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}

export default Toaster;
