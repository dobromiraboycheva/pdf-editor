import { MonitorPlay } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { PdfToPowerpointPage } from './PdfToPowerpointPage';
import { pdfToPowerpointProcessor } from './pdfToPowerpointProcessor';

export const pdfToPowerpointTool: PdfTool = {
  id: 'pdf-to-powerpoint',
  route: '/pdf-to-powerpoint',
  name: 'PDF to PowerPoint',
  tagline: 'Convert PDF to slideshow.',
  i18nKey: 'tools.pdfToPowerpoint',
  category: 'organize',
  icon: MonitorPlay,
  accent: 'bg-red-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: PdfToPowerpointPage,
  process: pdfToPowerpointProcessor,
};
