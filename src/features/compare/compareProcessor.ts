import type { ProcessorContext, ProcessResult } from '@/types/tool';

/**
 * Compare is a viewer-only tool — it renders side-by-side inside the UI and
 * does not produce a downloadable PDF. This processor is a no-op that
 * satisfies the `PdfTool.process` contract.
 */
export async function compareProcessor(
  _ctx: ProcessorContext,
): Promise<ProcessResult> {
  return { outputs: [] };
}
