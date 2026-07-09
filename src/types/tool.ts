import type { LucideIcon } from 'lucide-react';
import type { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type React from 'react';

export type ToolCategory = 'organize' | 'optimize' | 'edit' | 'security';

export interface IngestedPdf {
  id: string; // stable id: name+size+lastModified hash
  name: string;
  size: number;
  arrayBuffer: ArrayBuffer;
  pdfLibDoc: PDFDocument;
  pdfjsDoc: PDFDocumentProxy;
  pageCount: number;
}

export interface ProcessorContext {
  files: IngestedPdf[];
  options: unknown;
  onProgress?: (fraction: number, note?: string) => void;
  signal?: AbortSignal;
}

export interface ProcessResult {
  outputs: { name: string; blob: Blob }[];
  stats?: { inputBytes: number; outputBytes: number; durationMs: number };
}

export interface PdfTool {
  id: string;
  route: string;
  /** Fallback English name. Prefer `i18nKey` + `t()` in UI code. */
  name: string;
  /** Fallback English tagline. Prefer `i18nKey` + `t()` in UI code. */
  tagline: string;
  /** Optional dot-path root under `tools.<key>` in translation files, e.g. 'tools.merge'. */
  i18nKey?: string;
  category: ToolCategory;
  icon: LucideIcon;
  accent: string; // tailwind classes, e.g. 'bg-brand-500 text-white'
  accept: { minFiles: number; maxFiles: number };
  Page: React.ComponentType;
  process: (ctx: ProcessorContext) => Promise<ProcessResult>;
}
