import { Archive } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { PdfAPage } from './PdfAPage';
import { pdfAProcessor } from './pdfAProcessor';

export const pdfATool: PdfTool = {
  id: 'pdf-a',
  route: '/pdf-a',
  name: 'PDF to PDF/A',
  tagline: 'Convert to archival PDF/A format.',
  i18nKey: 'tools.pdfA',
  category: 'optimize',
  icon: Archive,
  accent: 'bg-blue-700 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: PdfAPage,
  process: pdfAProcessor,
};
