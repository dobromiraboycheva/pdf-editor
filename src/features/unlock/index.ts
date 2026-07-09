import { Unlock } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { UnlockPage } from './UnlockPage';
import { unlockProcessor } from './unlockProcessor';

export const unlockTool: PdfTool = {
  id: 'unlock',
  route: '/unlock',
  name: 'Unlock PDF',
  tagline: 'Remove password from a PDF.',
  i18nKey: 'tools.unlock',
  category: 'security',
  icon: Unlock,
  accent: 'bg-blue-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: UnlockPage,
  process: unlockProcessor,
};
