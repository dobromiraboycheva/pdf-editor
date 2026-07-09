import { Scissors } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { SplitPage } from './SplitPage';
import { splitProcessor } from './splitProcessor';

export const splitTool: PdfTool = {
  id: 'split',
  route: '/split',
  name: 'Split PDF',
  tagline: 'Split into individual pages or ranges.',
  i18nKey: 'tools.split',
  category: 'organize',
  icon: Scissors,
  accent: 'bg-emerald-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: SplitPage,
  process: splitProcessor,
};
