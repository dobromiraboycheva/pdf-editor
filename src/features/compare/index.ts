import { SplitSquareHorizontal } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { ComparePage } from './ComparePage';
import { compareProcessor } from './compareProcessor';

export const compareTool: PdfTool = {
  id: 'compare',
  route: '/compare',
  name: 'Compare PDF',
  tagline: 'Spot differences between two PDFs.',
  i18nKey: 'tools.compare',
  category: 'security',
  icon: SplitSquareHorizontal,
  accent: 'bg-cyan-600 text-white',
  accept: { minFiles: 2, maxFiles: 2 },
  Page: ComparePage,
  process: compareProcessor,
};
