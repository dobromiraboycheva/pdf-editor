import { Languages } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { TranslatePage } from './TranslatePage';

export const translateTool: PdfTool = {
  id: 'translate',
  route: '/translate',
  name: 'Translate PDF',
  tagline: 'Translate PDF content.',
  i18nKey: 'tools.translate',
  category: 'edit',
  icon: Languages,
  accent: 'bg-purple-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: TranslatePage,
  process: async () => ({ outputs: [] }),
};
