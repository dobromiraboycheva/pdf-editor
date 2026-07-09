import type { ProcessorContext, ProcessResult } from '@/types/tool';
import { embedStandardFont } from '@/lib/pdf/fontEmbed';

export interface FormsOptions {
  /** Field name → string (text/dropdown/radio selected option) or boolean (checkbox). */
  fieldValues: Record<string, string | boolean>;
  /** When true, flatten fields into page content on save. */
  flatten?: boolean;
}

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export async function formsProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  if (ctx.files.length !== 1) {
    throw new Error('Forms requires exactly one input file.');
  }
  const file = ctx.files[0];
  if (!file) throw new Error('Forms requires exactly one input file.');

  const options = ctx.options as FormsOptions;

  const {
    PDFDocument,
    PDFTextField,
    PDFCheckBox,
    PDFRadioGroup,
    PDFDropdown,
    PDFOptionList,
  } = await import('pdf-lib');

  // Reload with our own copy so we don't mutate the ingested document (which
  // may be shared with pdf.js and other views).
  const doc = await PDFDocument.load(file.arrayBuffer.slice(0), {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const form = doc.getForm();
  const fields = form.getFields();

  for (const field of fields) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const name = field.getName();
    if (!(name in options.fieldValues)) continue;
    const raw = options.fieldValues[name];

    try {
      if (field instanceof PDFTextField) {
        field.setText(typeof raw === 'string' ? raw : String(raw ?? ''));
      } else if (field instanceof PDFCheckBox) {
        if (raw === true) field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup) {
        if (typeof raw === 'string' && raw) {
          try {
            field.select(raw);
          } catch {
            // Ignore option that doesn't exist.
          }
        }
      } else if (field instanceof PDFDropdown) {
        if (typeof raw === 'string' && raw) {
          try {
            field.select(raw);
          } catch {
            // Ignore
          }
        }
      } else if (field instanceof PDFOptionList) {
        if (typeof raw === 'string' && raw) {
          try {
            field.select(raw);
          } catch {
            // Ignore
          }
        }
      }
    } catch {
      // Best-effort: skip fields we can't set.
    }
  }

  // Ensure appearance streams render with a broadly-compatible font.
  const font = await embedStandardFont(doc);
  try {
    form.updateFieldAppearances(font);
  } catch {
    // Non-WinAnsi values may throw; fall back to no-op — pdf-lib will still
    // update via the save-time hook where possible.
  }

  if (options.flatten) {
    form.flatten();
  }

  const bytes = await doc.save({ useObjectStreams: true });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const basename = stripPdfExt(file.name);

  return {
    outputs: [{ name: `${basename}-filled.pdf`, blob }],
    stats: {
      inputBytes: file.arrayBuffer.byteLength,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
