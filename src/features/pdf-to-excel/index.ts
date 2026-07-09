import { Sheet } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { PdfToExcelPage } from './PdfToExcelPage';
import { pdfToExcelProcessor } from './pdfToExcelProcessor';

export const pdfToExcelTool: PdfTool = {
  id: 'pdf-to-excel',
  route: '/pdf-to-excel',
  name: 'PDF to Excel',
  tagline: 'Extract tables to CSV.',
  i18nKey: 'tools.pdfToExcel',
  category: 'organize',
  icon: Sheet,
  accent: 'bg-green-600 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: PdfToExcelPage,
  process: pdfToExcelProcessor,
};
