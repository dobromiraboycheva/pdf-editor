import { FileArchive } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { CompressPage } from './CompressPage';
import { compressProcessor } from './compressProcessor';

export const compressTool: PdfTool = {
  id: 'compress',
  route: '/compress',
  name: 'Compress PDF',
  tagline: 'Make your PDFs smaller.',
  i18nKey: 'tools.compress',
  category: 'optimize',
  icon: FileArchive,
  accent: 'bg-violet-500 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: CompressPage,
  process: compressProcessor,
};
