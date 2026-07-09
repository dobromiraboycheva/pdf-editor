// Re-encode JPEG images embedded in a PDF at reduced dimensions and quality.
//
// Scope for v1: only image XObjects filtered by DCTDecode (i.e. JPEGs). PNGs
// and inline monochrome mask images are left untouched — they typically don't
// account for the bulk of user PDF size, and mixing lossy re-encoding with
// palette / soft-mask images requires more machinery than we want here.
//
// Approach:
//   1. Walk every indirect object; keep the ones that look like a JPEG image
//      XObject (PDFRawStream, /Subtype /Image, /Filter contains /DCTDecode).
//   2. For each, decode with createImageBitmap, redraw onto an OffscreenCanvas
//      whose longest side is capped by the requested level, and re-encode via
//      convertToBlob at the level's quality.
//   3. Swap the stream contents in place via a new PDFRawStream, updating
//      /Width and /Height on the dict.
//
// Every step is wrapped so a decode/draw failure just increments
// `imagesSkipped` — a compression pass must never lose data.

import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  type PDFDocument,
  type PDFObject,
  type PDFRef,
} from 'pdf-lib';

export type CompressLevel = 'low' | 'medium' | 'high';

export interface CompressStats {
  imagesTouched: number;
  imagesSkipped: number;
  bytesBefore: number;
  bytesAfter: number;
}

interface LevelSpec {
  maxSide: number;
  quality: number;
}

const LEVELS: Record<CompressLevel, LevelSpec> = {
  low: { maxSide: 2000, quality: 0.85 },
  medium: { maxSide: 1500, quality: 0.7 },
  high: { maxSide: 1000, quality: 0.55 },
};

// Images below this raw-byte size aren't worth touching — the header overhead
// and re-encode losses dominate.
const MIN_BYTES = 20_000;

export async function compressImagesInDoc(
  doc: PDFDocument,
  level: CompressLevel,
  onProgress?: (fraction: number, note?: string) => void,
  signal?: AbortSignal,
): Promise<CompressStats> {
  const spec = LEVELS[level];
  const stats: CompressStats = {
    imagesTouched: 0,
    imagesSkipped: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  };

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const candidates = collectJpegImageXObjects(doc);
  const total = candidates.length;
  if (total === 0) {
    onProgress?.(1);
    return stats;
  }

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const { ref, stream } = candidates[i];
    const originalBytes = stream.contents;

    if (originalBytes.length < MIN_BYTES) {
      stats.imagesSkipped++;
      onProgress?.((i + 1) / total, 'skipped-small');
      continue;
    }

    try {
      const recoded = await recompressJpeg(originalBytes, spec, signal);
      if (!recoded) {
        // No benefit from re-encoding (result was larger, or dimensions
        // already smaller than the cap) — leave as-is.
        stats.imagesSkipped++;
        onProgress?.((i + 1) / total, 'skipped-nogain');
        continue;
      }

      const newDict = cloneImageDict(stream.dict, recoded.width, recoded.height);
      const newStream = PDFRawStream.of(newDict, recoded.bytes);
      doc.context.assign(ref, newStream);

      stats.imagesTouched++;
      stats.bytesBefore += originalBytes.length;
      stats.bytesAfter += recoded.bytes.length;
      onProgress?.((i + 1) / total);
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        throw err;
      }
      // Any other failure: skip this image, keep going.
      stats.imagesSkipped++;
      onProgress?.((i + 1) / total, 'skipped-error');
    }
  }

  return stats;
}

interface JpegCandidate {
  ref: PDFRef;
  stream: PDFRawStream;
}

function collectJpegImageXObjects(doc: PDFDocument): JpegCandidate[] {
  const out: JpegCandidate[] = [];
  const objects = doc.context.enumerateIndirectObjects();

  for (const [ref, obj] of objects) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (!isJpegImageDict(obj.dict)) continue;
    out.push({ ref, stream: obj });
  }
  return out;
}

function isJpegImageDict(dict: PDFDict): boolean {
  const subtype = dict.get(PDFName.of('Subtype'));
  if (!(subtype instanceof PDFName) || subtype.asString() !== '/Image') {
    return false;
  }
  return filterChainContains(dict.get(PDFName.of('Filter')), 'DCTDecode');
}

function filterChainContains(
  filter: PDFObject | undefined,
  name: string,
): boolean {
  if (!filter) return false;
  if (filter instanceof PDFName) {
    return filter.asString() === `/${name}`;
  }
  if (filter instanceof PDFArray) {
    for (let i = 0; i < filter.size(); i++) {
      const entry = filter.get(i);
      if (entry instanceof PDFName && entry.asString() === `/${name}`) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Duplicate an image XObject dict but with new Width / Height values.
 * Length is auto-updated by pdf-lib on save via `updateDict()`.
 */
function cloneImageDict(
  source: PDFDict,
  width: number,
  height: number,
): PDFDict {
  const dict = PDFDict.withContext(source.context);
  for (const [key, value] of source.entries()) {
    dict.set(key, value);
  }
  dict.set(PDFName.of('Width'), PDFNumber.of(width));
  dict.set(PDFName.of('Height'), PDFNumber.of(height));
  return dict;
}

interface RecodedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

async function recompressJpeg(
  source: Uint8Array,
  spec: LevelSpec,
  signal: AbortSignal | undefined,
): Promise<RecodedImage | null> {
  if (typeof OffscreenCanvas === 'undefined') {
    // No OffscreenCanvas available — bail out of the compression pass
    // rather than pretending we did work.
    return null;
  }

  // createImageBitmap accepts a Blob directly; giving it a slice-backed one
  // avoids copying the buffer.
  const blob = new Blob([source as BlobPart], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);
  if (signal?.aborted) {
    bitmap.close();
    throw new DOMException('Aborted', 'AbortError');
  }

  try {
    const { width: srcW, height: srcH } = bitmap;
    const longest = Math.max(srcW, srcH);
    const scale = longest > spec.maxSide ? spec.maxSide / longest : 1;
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const outBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: spec.quality,
    });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // Only accept the re-encoded version if it's actually smaller.
    if (outBlob.size >= source.length) return null;

    const bytes = new Uint8Array(await outBlob.arrayBuffer());
    return { bytes, width: targetW, height: targetH };
  } finally {
    bitmap.close();
  }
}
