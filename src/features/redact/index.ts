import { EyeOff } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { RedactPage } from './RedactPage';
import { redactProcessor } from './redactProcessor';

export const redactTool: PdfTool = {
  id: 'redact',
  route: '/redact',
  name: 'Redact PDF',
  tagline: 'Permanently black out sensitive info.',
  i18nKey: 'tools.redact',
  category: 'security',
  icon: EyeOff,
  accent: 'bg-gray-800 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: RedactPage,
  process: redactProcessor,
};
