import { FileCode } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { PdfToMarkdownPage } from './PdfToMarkdownPage';
import { pdfToMarkdownProcessor } from './pdfToMarkdownProcessor';

export const pdfToMarkdownTool: PdfTool = {
  id: 'pdf-to-markdown',
  route: '/pdf-to-markdown',
  name: 'PDF to Markdown',
  tagline: 'Convert PDF to Markdown text.',
  i18nKey: 'tools.pdfToMarkdown',
  category: 'organize',
  icon: FileCode,
  accent: 'bg-slate-700 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: PdfToMarkdownPage,
  process: pdfToMarkdownProcessor,
};
