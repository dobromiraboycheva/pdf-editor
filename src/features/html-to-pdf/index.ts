import { Globe } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { HtmlToPdfPage } from './HtmlToPdfPage';

export const htmlToPdfTool: PdfTool = {
  id: 'html-to-pdf',
  route: '/html-to-pdf',
  name: 'HTML to PDF',
  tagline: 'Convert webpages to PDF.',
  i18nKey: 'tools.htmlToPdf',
  category: 'organize',
  icon: Globe,
  accent: 'bg-orange-500 text-white',
  accept: { minFiles: 0, maxFiles: 0 },
  Page: HtmlToPdfPage,
  process: async () => ({ outputs: [] }),
};
