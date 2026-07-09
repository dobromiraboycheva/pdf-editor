import { Combine } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { MergePage } from './MergePage';
import { mergeProcessor } from './mergeProcessor';

export const mergeTool: PdfTool = {
  id: 'merge',
  route: '/merge',
  name: 'Merge PDF',
  tagline: 'Combine PDFs into a single file.',
  i18nKey: 'tools.merge',
  category: 'organize',
  icon: Combine,
  accent: 'bg-brand-500 text-white',
  accept: { minFiles: 2, maxFiles: 50 },
  Page: MergePage,
  process: mergeProcessor,
};
