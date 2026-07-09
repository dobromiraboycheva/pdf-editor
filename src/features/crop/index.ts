import { Crop } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { CropPage } from './CropPage';
import { cropProcessor } from './cropProcessor';

export const cropTool: PdfTool = {
  id: 'crop',
  route: '/crop',
  name: 'Crop PDF',
  tagline: 'Trim margins or crop to a selected area.',
  i18nKey: 'tools.crop',
  category: 'edit',
  icon: Crop,
  accent: 'bg-cyan-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: CropPage,
  process: cropProcessor,
};
