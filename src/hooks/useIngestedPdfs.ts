import { useCallback, useEffect, useRef, useState } from 'react';
import type { IngestedPdf } from '@/types/tool';
import { ingestPdfFile } from '@/lib/files/ingest';
import { useRecentFiles } from '@/hooks/useRecentFiles';

/** Release worker-side pdf.js memory. Idempotent-ish; never throws. */
function destroyDoc(pdf: IngestedPdf): void {
  try {
    void pdf.pdfjsDoc.destroy().catch(() => {});
  } catch {
    // ignore — already destroyed or unavailable.
  }
}

export interface UseIngestedPdfsResult {
  files: IngestedPdf[];
  addFiles: (files: File[]) => Promise<void>;
  removeFile: (id: string) => void;
  reorderFiles: (fromIdx: number, toIdx: number) => void;
  clear: () => void;
  isIngesting: boolean;
  error: string | null;
}

/**
 * Pure React hook (no Zustand) managing an ordered list of ingested PDFs.
 * Dedupes by IngestedPdf.id.
 */
export function useIngestedPdfs(): UseIngestedPdfsResult {
  const [files, setFiles] = useState<IngestedPdf[]>([]);
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror of `files` for the unmount cleanup (which must not depend on `files`
  // to avoid re-running the effect on every change).
  const filesRef = useRef<IngestedPdf[]>([]);
  filesRef.current = files;

  // Destroy all currently-loaded pdf.js docs when the hook unmounts.
  useEffect(() => {
    return () => {
      for (const f of filesRef.current) destroyDoc(f);
    };
  }, []);

  const addFiles = useCallback(async (incoming: File[]): Promise<void> => {
    if (incoming.length === 0) return;
    setIsIngesting(true);
    setError(null);
    try {
      const ingested: IngestedPdf[] = [];
      for (const f of incoming) {
        try {
          const pdf = await ingestPdfFile(f);
          ingested.push(pdf);
          // Remember metadata only (never contents) for the "Recent" list.
          // Using getState() avoids calling a hook inside this callback.
          useRecentFiles.getState().addRecent({ name: f.name, size: f.size });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to load PDF.';
          setError(message);
        }
      }
      if (ingested.length > 0) {
        setFiles((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const additions = ingested.filter((p) => !seen.has(p.id));
          return additions.length === 0 ? prev : [...prev, ...additions];
        });
      }
    } finally {
      setIsIngesting(false);
    }
  }, []);

  const removeFile = useCallback((id: string): void => {
    setFiles((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) destroyDoc(target);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const reorderFiles = useCallback((fromIdx: number, toIdx: number): void => {
    setFiles((prev) => {
      if (
        fromIdx === toIdx ||
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= prev.length ||
        toIdx >= prev.length
      ) {
        return prev;
      }
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      if (!moved) return prev;
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const clear = useCallback((): void => {
    setFiles((prev) => {
      for (const f of prev) destroyDoc(f);
      return [];
    });
    setError(null);
  }, []);

  return {
    files,
    addFiles,
    removeFile,
    reorderFiles,
    clear,
    isIngesting,
    error,
  };
}
