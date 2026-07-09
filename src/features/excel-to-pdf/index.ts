import { Table } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { ExcelToPdfPage } from './ExcelToPdfPage';

export const excelToPdfTool: PdfTool = {
  id: 'excel-to-pdf',
  route: '/excel-to-pdf',
  name: 'Excel to PDF',
  tagline: 'Convert XLSX to PDF.',
  i18nKey: 'tools.excelToPdf',
  category: 'organize',
  icon: Table,
  accent: 'bg-green-600 text-white',
  accept: { minFiles: 0, maxFiles: 0 },
  Page: ExcelToPdfPage,
  process: async () => ({ outputs: [] }),
};
