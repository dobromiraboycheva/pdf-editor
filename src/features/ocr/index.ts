import { ScanText } from 'lucide-react';
import type { PdfTool } from '@/types/tool';
import { OcrPage } from './OcrPage';
import { ocrProcessor } from './ocrProcessor';

export const ocrTool: PdfTool = {
  id: 'ocr',
  route: '/ocr',
  name: 'OCR PDF',
  tagline: 'Make scanned PDFs searchable.',
  i18nKey: 'tools.ocr',
  category: 'optimize',
  icon: ScanText,
  accent: 'bg-green-600 text-white',
  accept: { minFiles: 1, maxFiles: 1 },
  Page: OcrPage,
  process: ocrProcessor,
};
