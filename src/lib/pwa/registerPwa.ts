// Registers the PWA service worker — but ONLY in a real browser, never inside the
// Tauri shell. Tauri serves the app from a custom protocol and manages its own
// lifecycle; a service worker there would conflict (stale caches, protocol mismatch).
//
// `virtual:pwa-register` is provided by vite-plugin-pwa at build time. During
// `vite dev` the SW is disabled by default, so this import resolves to a no-op.
import { isTauri } from '@/lib/files/platform';

export function registerPwa(): void {
  if (isTauri()) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // Dynamic import so the virtual module is only pulled in browser builds.
  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      // No SW available (e.g. dev without PWA devOptions) — safe to ignore.
    });
}
