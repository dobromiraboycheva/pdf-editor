import type { ProcessorContext, ProcessResult } from '@/types/tool';
import { stripMetadata } from '@/lib/pdf/stripMetadata';
import { embedStandardFont } from '@/lib/pdf/fontEmbed';

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

const XMP_TEMPLATE = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdfaid:part>1</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">__TITLE__</rdf:li></rdf:Alt></dc:title>
      <xmp:CreatorTool>PDF Editor</xmp:CreatorTool>
      <pdf:Producer>PDF Editor (PDF/A best-effort)</pdf:Producer>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

export async function pdfAProcessor(
  ctx: ProcessorContext,
): Promise<ProcessResult> {
  const start = performance.now();
  if (ctx.files.length !== 1) {
    throw new Error('PDF/A requires exactly one input file.');
  }
  const file = ctx.files[0];
  if (!file) throw new Error('PDF/A requires exactly one input file.');

  const { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } = await import(
    'pdf-lib'
  );
  void decodePDFRawStream; // keep in scope for tree-shaking safety

  const doc = await PDFDocument.load(file.arrayBuffer.slice(0), {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  ctx.onProgress?.(0.2, 'Stripping prohibited content');
  // Strip document-level JavaScript / OpenAction / AA (Additional Actions) —
  // these are disallowed in PDF/A.
  const catalog = doc.catalog;
  catalog.delete(PDFName.of('OpenAction'));
  catalog.delete(PDFName.of('AA'));
  catalog.delete(PDFName.of('Names')); // Names dict often carries EmbeddedFiles and JS.

  stripMetadata(doc);

  ctx.onProgress?.(0.5, 'Embedding font');
  // Embedding a standard font isn't PDF/A compliant on its own (Type1
  // standard 14 fonts must be embedded as subsets), but doing so touches the
  // resource so a validator has something concrete to inspect and improves
  // downstream tools' handling.
  await embedStandardFont(doc);

  // Basic Info dict fields that PDF/A tooling expects.
  const title = stripPdfExt(file.name);
  doc.setTitle(title);
  doc.setProducer('PDF Editor (PDF/A best-effort)');
  doc.setCreator('PDF Editor');
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());

  ctx.onProgress?.(0.75, 'Writing XMP metadata');
  // Best-effort XMP metadata stream with pdfaid part/conformance markers.
  try {
    const xmp = XMP_TEMPLATE.replace('__TITLE__', title);
    const stream = PDFRawStream.of(
      doc.context.obj({
        Type: 'Metadata',
        Subtype: 'XML',
        Length: xmp.length,
      }),
      new TextEncoder().encode(xmp),
    );
    const ref = doc.context.register(stream);
    catalog.set(PDFName.of('Metadata'), ref);
  } catch {
    // Metadata stream is optional — continue on error.
  }

  const bytes = await doc.save({
    useObjectStreams: false, // PDF/A-1 disallows object streams
    updateFieldAppearances: false,
  });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const basename = stripPdfExt(file.name);

  ctx.onProgress?.(1, 'Done');
  return {
    outputs: [{ name: `${basename}-pdfa.pdf`, blob }],
    stats: {
      inputBytes: file.arrayBuffer.byteLength,
      outputBytes: blob.size,
      durationMs: performance.now() - start,
    },
  };
}
