import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  type PDFField,
} from 'pdf-lib';
import { ToolShell } from '@/components/layout/ToolShell';
import { FileDropzone } from '@/components/pdf/FileDropzone';
import { ProcessButton } from '@/components/pdf/ProcessButton';
import { ProgressOverlay } from '@/components/pdf/ProgressOverlay';
import { Card, CardContent } from '@/components/ui/card';
import { useIngestedPdfs } from '@/hooks/useIngestedPdfs';
import { downloadBlob } from '@/lib/files/download';
import { formatBytes } from '@/lib/utils/formatBytes';
import { formsProcessor } from './formsProcessor';

type FieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionList';

interface FieldDescriptor {
  name: string;
  kind: FieldKind;
  options?: string[];
  initial: string | boolean;
}

function describe(field: PDFField): FieldDescriptor | null {
  const name = field.getName();
  if (field instanceof PDFTextField) {
    return { name, kind: 'text', initial: field.getText() ?? '' };
  }
  if (field instanceof PDFCheckBox) {
    return { name, kind: 'checkbox', initial: field.isChecked() };
  }
  if (field instanceof PDFRadioGroup) {
    return {
      name,
      kind: 'radio',
      options: field.getOptions(),
      initial: field.getSelected() ?? '',
    };
  }
  if (field instanceof PDFDropdown) {
    return {
      name,
      kind: 'dropdown',
      options: field.getOptions(),
      initial: field.getSelected()?.[0] ?? '',
    };
  }
  if (field instanceof PDFOptionList) {
    return {
      name,
      kind: 'optionList',
      options: field.getOptions(),
      initial: field.getSelected()?.[0] ?? '',
    };
  }
  return null;
}

export function FormsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { files, addFiles, clear, isIngesting, error } = useIngestedPdfs();

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ size: number } | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [flatten, setFlatten] = useState(false);

  const file = files[0];

  const fields = useMemo<FieldDescriptor[]>(() => {
    if (!file) return [];
    try {
      const form = file.pdfLibDoc.getForm();
      return form
        .getFields()
        .map(describe)
        .filter((d): d is FieldDescriptor => d !== null);
    } catch {
      return [];
    }
  }, [file]);

  useEffect(() => {
    // Seed values from initial field values whenever the file changes.
    const init: Record<string, string | boolean> = {};
    for (const f of fields) init[f.name] = f.initial;
    setValues(init);
    setResult(null);
  }, [fields]);

  const canSave = !!file && !busy && !isIngesting && fields.length > 0;

  const handleSave = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    setNote('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await formsProcessor({
        files: [file],
        options: { fieldValues: values, flatten },
        signal: ac.signal,
        onProgress: (f, n) => {
          setProgress(f);
          if (n) setNote(n);
        },
      });
      const out = res.outputs[0];
      if (out) {
        await downloadBlob(out.blob, out.name);
        setResult({ size: out.blob.size });
      }
    } catch (e) {
      if (ac.signal.aborted || (e as Error).message === 'aborted') {
        // user cancelled — silent
      } else {
        toast({ message: t('tools.forms.failed', { message: (e as Error).message }), variant: 'error' });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [file, values, flatten, t]);

  const renderControl = (f: FieldDescriptor): ReactNode => {
    const v = values[f.name];
    switch (f.kind) {
      case 'text':
        return (
          <input
            type="text"
            value={typeof v === 'string' ? v : ''}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [f.name]: e.target.value }))
            }
            className="h-10 w-full rounded-button border border-black/10 bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        );
      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={v === true}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [f.name]: e.target.checked }))
            }
            className="h-4 w-4 accent-brand-500"
          />
        );
      case 'radio':
      case 'dropdown':
      case 'optionList': {
        const opts = f.options ?? [];
        return (
          <select
            value={typeof v === 'string' ? v : ''}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [f.name]: e.target.value }))
            }
            className="h-10 w-full rounded-button border border-black/10 bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">—</option>
            {opts.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );
      }
    }
  };

  return (
    <ToolShell
      title={t('tools.forms.name')}
      tagline={t('tools.forms.description')}
      onStartOver={file ? clear : undefined}
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="text-sm text-ink-muted">
            {!file && t('tools.forms.description')}
            {file && fields.length > 0 && (
              <span>
                {t('tools.forms.detectedFields')}: {fields.length}
              </span>
            )}
            {file && fields.length === 0 && t('tools.forms.noFields')}
          </div>
          {file && fields.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={flatten}
                onChange={(e) => setFlatten(e.target.checked)}
                className="h-4 w-4 accent-brand-500"
              />
              Flatten fields on save
            </label>
          )}
          <ProcessButton
            label={t('tools.forms.cta')}
            onClick={handleSave}
            disabled={!canSave}
            loading={busy}
          />
          {result && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {t('tools.forms.success', { size: formatBytes(result.size) })}
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
        <div className="flex flex-col gap-4">
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
                  {file.pageCount} {t('common.pages')} ·{' '}
                  {formatBytes(file.size)}
                </p>
              </div>
            </CardContent>
          </Card>

          {fields.length === 0 ? (
            <div className="rounded-card border border-dashed border-black/10 bg-surface-muted/40 p-6 text-center text-sm text-ink-muted">
              {t('tools.forms.noFields')}
            </div>
          ) : (
            <div className="rounded-card border border-black/5 bg-white p-4 shadow-card">
              <h2 className="mb-4 text-sm font-semibold text-ink">
                {t('tools.forms.detectedFields')}
              </h2>
              <div className="flex flex-col gap-4">
                {fields.map((f) => (
                  <div key={f.name} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-ink-muted">
                      {f.name}{' '}
                      <span className="text-ink-muted/60">({f.kind})</span>
                    </label>
                    {renderControl(f)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <ProgressOverlay
        open={busy}
        label={note || t('tools.forms.progress')}
        fraction={progress}
        onCancel={() => abortRef.current?.abort()}
      />
    </ToolShell>
  );
}

export default FormsPage;
