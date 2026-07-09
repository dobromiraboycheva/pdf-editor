import { Hash } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { PageNumbersPage } from './PageNumbersPage';
import { pageNumbersProcessor } from './pageNumbersProcessor';

export const pageNumbersTool: PdfTool = {
  id: 'page-numbers',
  route: '/page-numbers',
  name: 'Add Page Numbers',
  tagline: 'Number pages of your PDF.',
  i18nKey: 'tools.pageNumbers',
  category: 'edit',
  icon: Hash,
  accent: 'bg-indigo-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: PageNumbersPage,
  process: pageNumbersProcessor,
};
