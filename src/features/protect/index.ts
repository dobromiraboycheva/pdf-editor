import { Shield } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { ProtectPage } from './ProtectPage';
import { protectProcessor } from './protectProcessor';

export const protectTool: PdfTool = {
  id: 'protect',
  route: '/protect',
  name: 'Protect PDF',
  tagline: 'Add a password to your PDF.',
  i18nKey: 'tools.protect',
  category: 'security',
  icon: Shield,
  accent: 'bg-red-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: ProtectPage,
  process: protectProcessor,
};
