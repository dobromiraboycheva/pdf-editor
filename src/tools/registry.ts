import type { PdfTool } from '@/types/tool';
import { mergeTool } from '@/features/merge';
import { splitTool } from '@/features/split';
import { rotateTool } from '@/features/rotate';
import { extractTool } from '@/features/extract';
import { compressTool } from '@/features/compress';
import { watermarkTool } from '@/features/watermark';
import { pageNumbersTool } from '@/features/page-numbers';
import { cropTool } from '@/features/crop';
import { editTool } from '@/features/edit';
import { pdfToJpgTool } from '@/features/pdf-to-jpg';
import { jpgToPdfTool } from '@/features/jpg-to-pdf';
import { htmlToPdfTool } from '@/features/html-to-pdf';
import { ocrTool } from '@/features/ocr';
import { scanTool } from '@/features/scan';
import { summarizeTool } from '@/features/summarize';
import { translateTool } from '@/features/translate';
import { wordToPdfTool } from '@/features/word-to-pdf';
import { excelToPdfTool } from '@/features/excel-to-pdf';
import { powerpointToPdfTool } from '@/features/powerpoint-to-pdf';
import { pdfToWordTool } from '@/features/pdf-to-word';
import { pdfToExcelTool } from '@/features/pdf-to-excel';
import { pdfToPowerpointTool } from '@/features/pdf-to-powerpoint';
import { protectTool } from '@/features/protect';
import { unlockTool } from '@/features/unlock';
import { signTool } from '@/features/sign';
import { redactTool } from '@/features/redact';
import { organizeTool } from '@/features/organize';
import { repairTool } from '@/features/repair';
import { compareTool } from '@/features/compare';
import { formsTool } from '@/features/forms';
import { pdfToMarkdownTool } from '@/features/pdf-to-markdown';
import { pdfATool } from '@/features/pdf-a';

export const TOOLS: PdfTool[] = [
  mergeTool,
  splitTool,
  rotateTool,
  extractTool,
  compressTool,
  watermarkTool,
  pageNumbersTool,
  cropTool,
  editTool,
  pdfToJpgTool,
  jpgToPdfTool,
  htmlToPdfTool,
  ocrTool,
  scanTool,
  summarizeTool,
  translateTool,
  wordToPdfTool,
  excelToPdfTool,
  powerpointToPdfTool,
  pdfToWordTool,
  pdfToExcelTool,
  pdfToPowerpointTool,
  protectTool,
  unlockTool,
  signTool,
  redactTool,
  organizeTool,
  repairTool,
  compareTool,
  formsTool,
  pdfToMarkdownTool,
  pdfATool,
];

export function findToolByRoute(route: string): PdfTool | undefined {
  return TOOLS.find((t) => t.route === route);
}

export function toolsByCategory(): Record<string, PdfTool[]> {
  return TOOLS.reduce(
    (acc, tool) => {
      (acc[tool.category] ??= []).push(tool);
      return acc;
    },
    {} as Record<string, PdfTool[]>,
  );
}
