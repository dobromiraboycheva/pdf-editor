import { FileType } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { PdfToWordPage } from './PdfToWordPage';
import { pdfToWordProcessor } from './pdfToWordProcessor';

export const pdfToWordTool: PdfTool = {
  id: 'pdf-to-word',
  route: '/pdf-to-word',
  name: 'PDF to Word',
  tagline: 'Convert PDF to editable Word/RTF.',
  i18nKey: 'tools.pdfToWord',
  category: 'organize',
  icon: FileType,
  accent: 'bg-blue-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: PdfToWordPage,
  process: pdfToWordProcessor,
};
