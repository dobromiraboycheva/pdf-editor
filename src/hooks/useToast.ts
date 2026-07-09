import { create } from 'zustand';

export type ToastVariant = 'error' | 'success' | 'info';

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. Defaults to 4000. */
  duration?: number;
}

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  toast: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
}

let nextId = 0;

/**
 * Lightweight global toast store (zustand). Any component can trigger a toast
 * via `const { toast } = useToast(); toast({ message, variant })`. The single
 * `<Toaster />` mounted in App.tsx subscribes to `toasts` and renders them.
 */
export const useToast = create<ToastState>((set) => ({
  toasts: [],
  toast: ({ message, variant = 'info', duration = 4000 }) => {
    const id = nextId++;
    set((state) => ({
      toasts: [...state.toasts, { id, message, variant, duration }],
    }));
    return id;
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
}));
