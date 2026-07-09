import { LayoutGrid } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { OrganizePage } from './OrganizePage';
import { organizeProcessor } from './organizeProcessor';

export const organizeTool: PdfTool = {
  id: 'organize',
  route: '/organize',
  name: 'Organize PDF',
  tagline: 'Sort, delete, rotate pages.',
  i18nKey: 'tools.organize',
  category: 'organize',
  icon: LayoutGrid,
  accent: 'bg-amber-600 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: OrganizePage,
  process: organizeProcessor,
};
