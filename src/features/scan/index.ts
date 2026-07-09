import { ScanLine } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { ScanPage } from './ScanPage';

export const scanTool: PdfTool = {
  id: 'scan',
  route: '/scan',
  name: 'Scan to PDF',
  tagline: 'Scan documents with your camera.',
  i18nKey: 'tools.scan',
  category: 'organize',
  icon: ScanLine,
  accent: 'bg-orange-500 text-white',
  accept: { minFiles: 0, maxFiles: 0 },
  Page: ScanPage,
  // Page invokes scanProcessor directly with local state.
  process: async () => ({ outputs: [] }),
};
