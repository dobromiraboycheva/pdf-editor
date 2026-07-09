// Download helper — one entry point that branches on Tauri vs browser.
//
// Browser: creates an <a download> and clicks it.
// Tauri:   opens the native save dialog, then writes bytes to the chosen path.
//
// The Tauri modules are imported dynamically so the browser bundle never pulls them in.

import { isTauri } from './platform';

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  if (isTauri()) {
    await saveViaTauri(blob, filename);
  } else {
    saveViaBrowser(blob, filename);
  }
}

function saveViaBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Give the browser a tick to start the download before we revoke.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

async function saveViaTauri(blob: Blob, filename: string): Promise<void> {
  const [{ save }, { writeFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);

  const suggested = filename;
  const path = await save({
    defaultPath: suggested,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!path) return; // user cancelled

  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile(path, bytes);
}
