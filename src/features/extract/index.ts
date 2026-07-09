import { FileOutput } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { ExtractPage } from './ExtractPage';
import { extractProcessor } from './extractProcessor';

export const extractTool: PdfTool = {
  id: 'extract',
  route: '/extract',
  name: 'Extract Pages',
  tagline: 'Pull specific pages into a new PDF.',
  i18nKey: 'tools.extract',
  category: 'organize',
  icon: FileOutput,
  accent: 'bg-teal-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: ExtractPage,
  process: extractProcessor,
};
