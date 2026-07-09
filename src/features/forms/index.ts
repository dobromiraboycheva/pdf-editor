import { FormInput } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { FormsPage } from './FormsPage';
import { formsProcessor } from './formsProcessor';

export const formsTool: PdfTool = {
  id: 'forms',
  route: '/forms',
  name: 'PDF Forms',
  tagline: 'Fill or create fillable forms.',
  i18nKey: 'tools.forms',
  category: 'edit',
  icon: FormInput,
  accent: 'bg-purple-600 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: FormsPage,
  process: formsProcessor,
};
