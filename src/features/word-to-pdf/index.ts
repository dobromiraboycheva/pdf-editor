import { FileText } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { WordToPdfPage } from './WordToPdfPage';

export const wordToPdfTool: PdfTool = {
  id: 'word-to-pdf',
  route: '/word-to-pdf',
  name: 'Word to PDF',
  tagline: 'Convert DOCX to PDF.',
  i18nKey: 'tools.wordToPdf',
  category: 'organize',
  icon: FileText,
  accent: 'bg-blue-600 text-white',
  accept: { minFiles: 0, maxFiles: 0 },
  Page: WordToPdfPage,
  process: async () => ({ outputs: [] }),
};
