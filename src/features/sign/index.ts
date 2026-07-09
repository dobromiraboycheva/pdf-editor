import { PenTool } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { SignPage } from './SignPage';
import { signProcessor } from './signProcessor';

export const signTool: PdfTool = {
  id: 'sign',
  route: '/sign',
  name: 'Sign PDF',
  tagline: 'Add your signature to a PDF.',
  i18nKey: 'tools.sign',
  category: 'security',
  icon: PenTool,
  accent: 'bg-indigo-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: SignPage,
  process: signProcessor,
};
