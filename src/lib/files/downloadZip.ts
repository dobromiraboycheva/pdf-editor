// Bundle a set of blobs into a single ZIP and hand it off to the user.
//
// Same branching model as `download.ts`: browser gets a click-to-download
// anchor, Tauri gets a native save dialog.

import JSZip from 'jszip';
import { isTauri } from './platform';

export interface ZipEntry {
  name: string;
  blob: Blob;
}

/**
 * Zip the given entries and deliver the archive to the user.
 * Resolves after the download starts (browser) or the write completes /
 * user cancels the save dialog (Tauri).
 */
export async function downloadZip(
  entries: ZipEntry[],
  zipFilename: string,
): Promise<void> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.name, entry.blob);
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  if (isTauri()) {
    await saveViaTauri(zipBlob, zipFilename);
  } else {
    saveViaBrowser(zipBlob, zipFilename);
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

  const path = await save({
    defaultPath: filename,
    filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
  });
  if (!path) return; // user cancelled

  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile(path, bytes);
}
