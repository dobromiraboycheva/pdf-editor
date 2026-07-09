import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ThumbnailStrip } from '@/components/pdf/ThumbnailStrip';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { useIngestedPdfs } from '@/hooks/useIngestedPdfs';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import { mergeProcessor } from './mergeProcessor';

export function MergePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, removeFile, reorderFiles, clear, isIngesting, error } =
    useIngestedPdfs();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ size: number; blob: Blob } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canMerge = files.length >= 2 && !busy && !isIngesting;

  const handleMerge = useCallback(async () => {
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await mergeProcessor({
        files,
        options: {},
        signal: ac.signal,
        onProgress: (f, n) => {
          setProgress(f);
          if (n) setNote(n);
        },
      });
      const out = res.outputs[0];
      await downloadBlob(out.blob, out.name);
      setResult({ size: out.blob.size, blob: out.blob });
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        toast({ message: t('tools.merge.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [files, t]);

  return (
    <ToolShell
      title={t('tools.merge.name')}
      tagline={t('tools.merge.description')}
      onStartOver={files.length > 0 ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {files.length === 0 && t('tools.merge.hintEmpty')}
            {files.length === 1 && t('tools.merge.hintOne')}
            {files.length >= 2 && t('tools.merge.hintReady', { count: files.length })}
          </div>
          <ProcessButton
            label={
              files.length > 1
                ? t('tools.merge.ctaWithCount', { count: files.length })
                : t('tools.merge.cta')
            }
            onClick={handleMerge}
            disabled={!canMerge}
            loading={busy}
          />
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.merge.success', { size: formatBytes(result.size) })}
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
      }
    >
      {files.length === 0 ? (
        <FileDropzone onFiles={addFiles} multiple isIngesting={isIngesting} />
      ) : (
        <div className="flex flex-col gap-4">
          <ThumbnailStrip
            files={files.map((f) => ({ id: f.id, name: f.name, pageCount: f.pageCount }))}
            onReorder={reorderFiles}
            onRemove={removeFile}
            onAddMore={() => document.getElementById('merge-add-more-input')?.click()}
          />
          <input
            id="merge-add-more-input"
            type="file"
            accept="application/pdf"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const list = e.target.files ? Array.from(e.target.files) : [];
              if (list.length) void addFiles(list);
              e.target.value = '';
            }}
          />
        </div>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.merge.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}
