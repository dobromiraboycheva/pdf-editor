import { MonitorPlay } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { PowerpointToPdfPage } from './PowerpointToPdfPage';

export const powerpointToPdfTool: PdfTool = {
  id: 'powerpoint-to-pdf',
  route: '/powerpoint-to-pdf',
  name: 'PowerPoint to PDF',
  tagline: 'Convert PPTX to PDF.',
  i18nKey: 'tools.powerpointToPdf',
  category: 'organize',
  icon: MonitorPlay,
  accent: 'bg-red-500 text-white',
  accept: { minFiles: 0, maxFiles: 0 },
  Page: PowerpointToPdfPage,
  process: async () => ({ outputs: [] }),
};
