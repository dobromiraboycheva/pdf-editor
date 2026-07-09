// Tauri v2 exposes window.__TAURI_INTERNALS__ (not the v1 window.__TAURI__).
// This is a stub-friendly check that works in browser and Tauri without
// importing @tauri-apps/api (we don't take that dep until M5).

export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ !== undefined
  );
}
