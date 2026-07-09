/**
 * Listens for `.pdf` files opened via the OS (double-click, "Open with…", Finder/Explorer).
 *
 * The Rust shell emits an `open-pdf` event with the file's absolute path on:
 *   - macOS: RunEvent::Opened (cold start + hot open, via Launch Services)
 *   - Windows/Linux: argv on cold start, single-instance callback on hot open
 *
 * In a browser build (isTauri() === false) this hook is a no-op — the dynamic import is
 * gated so `@tauri-apps/api` never enters the browser bundle.
 */
import { useEffect } from 'react';
import { isTauri } from '@/lib/files/platform';

export type OpenPdfHandler = (path: string) => void;

export function useTauriOpenPdf(handler: OpenPdfHandler): void {
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      if (cancelled) return;
      unlisten = await listen<string>('open-pdf', (event) => {
        handler(event.payload);
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handler]);
}
