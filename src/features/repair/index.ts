import { Wrench } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { RepairPage } from './RepairPage';
import { repairProcessor } from './repairProcessor';

export const repairTool: PdfTool = {
  id: 'repair',
  route: '/repair',
  name: 'Repair PDF',
  tagline: 'Fix a broken PDF file.',
  i18nKey: 'tools.repair',
  category: 'optimize',
  icon: Wrench,
  accent: 'bg-green-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: RepairPage,
  process: repairProcessor,
};
