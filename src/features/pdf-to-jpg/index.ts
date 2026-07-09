import { Image } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { PdfToJpgPage } from './PdfToJpgPage';
import { pdfToJpgProcessor } from './pdfToJpgProcessor';

export const pdfToJpgTool: PdfTool = {
  id: 'pdf-to-jpg',
  route: '/pdf-to-jpg',
  name: 'PDF to JPG',
  tagline: 'Convert PDF pages to JPG images.',
  i18nKey: 'tools.pdfToJpg',
  category: 'organize',
  icon: Image,
  accent: 'bg-yellow-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: PdfToJpgPage,
  process: pdfToJpgProcessor,
};
