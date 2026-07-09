/**
 * Annotation data model.
 *
 * All coordinates are in PDF-space (points). We store them with a
 * TOP-LEFT origin (y grows down) so that the Konva rendering layer is a
 * straight `x * scale`/`y * scale` map — no per-frame Y-flip during
 * interaction. The Y-flip to pdf-lib's bottom-left origin happens once,
 * at save time, inside `editProcessor.ts`.
 */

export type AnnotationKind =
  | 'text'
  | 'image'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'freehand'
  | 'highlight';

export interface BaseAnnotation {
  id: string;
  kind: AnnotationKind;
  pageIndex: number;
}

export type TextFontFamily = 'Helvetica' | 'Times' | 'Courier';
export type TextAlignment = 'left' | 'center' | 'right';

export interface TextAnnotation extends BaseAnnotation {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  colorHex: string;
  /** Optional wrap width in PDF points. */
  width?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontFamily?: TextFontFamily;
  alignment?: TextAlignment;
}

export interface ImageAnnotation extends BaseAnnotation {
  kind: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Base64 data URL used for the Konva preview. */
  dataUrl: string;
  mimeType: 'image/png' | 'image/jpeg';
  /** Present at save-time so pdf-lib can embed the original bytes. */
  fileBlob?: Blob;
}

export interface RectAnnotation extends BaseAnnotation {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  strokeHex: string;
  fillHex?: string;
  strokeWidth: number;
  opacity: number;
}

export interface EllipseAnnotation extends BaseAnnotation {
  kind: 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  strokeHex: string;
  fillHex?: string;
  strokeWidth: number;
  opacity: number;
}

export interface LineAnnotation extends BaseAnnotation {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeHex: string;
  strokeWidth: number;
  opacity: number;
}

export interface ArrowAnnotation extends BaseAnnotation {
  kind: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeHex: string;
  strokeWidth: number;
  opacity: number;
}

export interface FreehandAnnotation extends BaseAnnotation {
  kind: 'freehand';
  points: { x: number; y: number }[];
  strokeHex: string;
  strokeWidth: number;
  opacity: number;
}

export interface HighlightAnnotation extends BaseAnnotation {
  kind: 'highlight';
  x: number;
  y: number;
  width: number;
  height: number;
  colorHex: string;
}

export type Annotation =
  | TextAnnotation
  | ImageAnnotation
  | RectAnnotation
  | EllipseAnnotation
  | LineAnnotation
  | ArrowAnnotation
  | FreehandAnnotation
  | HighlightAnnotation;

export function isText(a: Annotation): a is TextAnnotation {
  return a.kind === 'text';
}
export function isImage(a: Annotation): a is ImageAnnotation {
  return a.kind === 'image';
}
export function isRect(a: Annotation): a is RectAnnotation {
  return a.kind === 'rect';
}
export function isEllipse(a: Annotation): a is EllipseAnnotation {
  return a.kind === 'ellipse';
}
export function isLine(a: Annotation): a is LineAnnotation {
  return a.kind === 'line';
}
export function isArrow(a: Annotation): a is ArrowAnnotation {
  return a.kind === 'arrow';
}
export function isFreehand(a: Annotation): a is FreehandAnnotation {
  return a.kind === 'freehand';
}
export function isHighlight(a: Annotation): a is HighlightAnnotation {
  return a.kind === 'highlight';
}

/**
 * A patch for `updateAnnotation`. Discriminated-union `Partial<>` collapses
 * to only the shared keys, so we spell out the per-kind Partials as a union.
 */
export type AnnotationPatch =
  | Partial<TextAnnotation>
  | Partial<ImageAnnotation>
  | Partial<RectAnnotation>
  | Partial<EllipseAnnotation>
  | Partial<LineAnnotation>
  | Partial<ArrowAnnotation>
  | Partial<FreehandAnnotation>
  | Partial<HighlightAnnotation>;
