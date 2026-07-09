import { ImagePlus } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { JpgToPdfPage } from './JpgToPdfPage';

export const jpgToPdfTool: PdfTool = {
  id: 'jpg-to-pdf',
  route: '/jpg-to-pdf',
  name: 'JPG to PDF',
  tagline: 'Combine images into a PDF.',
  i18nKey: 'tools.jpgToPdf',
  category: 'organize',
  icon: ImagePlus,
  accent: 'bg-yellow-600 text-white',
  // Signals custom (non-PDF) input handling. The page manages its own state and
  // invokes jpgToPdfProcessor directly rather than through the shell contract.
  accept: { minFiles: 0, maxFiles: 0 },
  Page: JpgToPdfPage,
  process: async () => ({ outputs: [] }),
};
