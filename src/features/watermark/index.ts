import { Stamp } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { WatermarkPage } from './WatermarkPage';
import { watermarkProcessor } from './watermarkProcessor';

export const watermarkTool: PdfTool = {
  id: 'watermark',
  route: '/watermark',
  name: 'Watermark',
  tagline: 'Stamp text or images on every page.',
  i18nKey: 'tools.watermark',
  category: 'edit',
  icon: Stamp,
  accent: 'bg-pink-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: WatermarkPage,
  process: watermarkProcessor,
};
