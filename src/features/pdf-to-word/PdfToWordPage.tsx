import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Card, CardContent } from '@/components/ui/card';
import { useIngestedPdfs } from '@/hooks/useIngestedPdfs';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import { pdfToWordProcessor } from './pdfToWordProcessor';

interface ConversionResult {
  name: string;
  size: number;
}

export function PdfToWordPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);

  const file = files[0];
  const canConvert = !!file && !busy && !isIngesting;

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await pdfToWordProcessor({
        files: [file],
        options: {},
        signal: ac.signal,
        onProgress: (f, n) => {
          setProgress(f);
          if (n) setNote(n);
        },
      });
      const out = res.outputs[0];
      if (out) {
        await downloadBlob(out.blob, out.name);
        setResult({ name: out.name, size: out.blob.size });
      }
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        toast({ message: t('tools.pdfToWord.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, t]);

  return (
    <ToolShell
      title={t('tools.pdfToWord.name')}
      tagline={t('tools.pdfToWord.description')}
      onStartOver={file ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <ProcessButton
            label={t('tools.pdfToWord.cta')}
            onClick={handleConvert}
            disabled={!canConvert}
            loading={busy}
          />
          <p className="text-xs text-ink-muted">
            {t('tools.pdfToWord.noteDocx')}
          </p>
          {!file && (
            <p className="text-xs text-ink-muted">
              {t('tools.pdfToWord.hintEmpty')}
            </p>
          )}
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.pdfToWord.success', {
                name: result.name,
                size: formatBytes(result.size),
              })}
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
      }
    >
      {!file ? (
        <FileDropzone
          onFiles={addFiles}
          multiple={false}
          isIngesting={isIngesting}
        />
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="min-w-0">
              <p
                className="truncate text-base font-medium text-ink"
                title={file.name}
              >
                {file.name}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {file.pageCount} {t('common.pages')} · {formatBytes(file.size)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.pdfToWord.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default PdfToWordPage;
