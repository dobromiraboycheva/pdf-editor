import { RotateCw } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { RotatePage } from './RotatePage';
import { rotateProcessor } from './rotateProcessor';

export const rotateTool: PdfTool = {
  id: 'rotate',
  route: '/rotate',
  name: 'Rotate PDF',
  tagline: 'Rotate pages 90°, 180° or 270°.',
  i18nKey: 'tools.rotate',
  category: 'organize',
  icon: RotateCw,
  accent: 'bg-amber-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: RotatePage,
  process: rotateProcessor,
};
