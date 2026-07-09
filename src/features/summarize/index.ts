import { Sparkles } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { SummarizePage } from './SummarizePage';

export const summarizeTool: PdfTool = {
  id: 'summarize',
  route: '/summarize',
  name: 'AI Summarize',
  tagline: 'Get a short summary of your PDF.',
  i18nKey: 'tools.summarize',
  category: 'edit',
  icon: Sparkles,
  accent: 'bg-violet-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: SummarizePage,
  process: async () => ({ outputs: [] }),
};
