import { PenLine } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { EditPage } from './EditPage';
import { editProcessor } from './editProcessor';

export const editTool: PdfTool = {
  id: 'edit',
  route: '/edit',
  name: 'Edit PDF',
  tagline: 'Add text, images, drawings, shapes.',
  i18nKey: 'tools.edit',
  category: 'edit',
  icon: PenLine,
  accent: 'bg-fuchsia-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: EditPage,
  process: editProcessor,
};
