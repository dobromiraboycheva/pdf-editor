import { useEffect, useRef } from 'react';
import { Rect, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { TextAnnotation } from '../annotationTypes';
import type { PageSpace } from '../pdfSpaceMap';
import { pdfToCanvas, scaleFactor, unscaleDelta } from '../pdfSpaceMap';

interface Props {
  annotation: TextAnnotation;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<TextAnnotation>) => void;
  onRequestEdit: () => void;
  pageSpace: PageSpace;
}

/**
 * A Konva `<Text>` bound to a `TextAnnotation`. Double-click on the shape
 * dispatches `onRequestEdit`, which the parent handles by mounting an
 * absolutely-positioned <textarea> for in-place editing.
 */
export function TextLayer({
  annotation,
  isSelected,
  onSelect,
  onChange,
  onRequestEdit,
  pageSpace,
}: Props) {
  const shapeRef = useRef<Konva.Text | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const s = scaleFactor(pageSpace);
  const { x, y } = pdfToCanvas(pageSpace, annotation.x, annotation.y);

  useEffect(() => {
    if (isSelected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  // Selection outline geometry — estimate a bounding box around the text.
  // Konva measures the actual rendered width, but we don't have that until
  // after paint; fall back to (width || fontSize * text.length * 0.6).
  const outlineWidth =
    annotation.width !== undefined
      ? annotation.width * s
      : Math.max(20, annotation.text.length * annotation.fontSize * 0.55) * s;
  const outlineHeight = Math.max(annotation.fontSize * 1.4, 20) * s;

  return (
    <>
      <Text
        ref={shapeRef}
        text={annotation.text || ' '}
        x={x}
        y={y}
        fontSize={annotation.fontSize * s}
        fill={annotation.colorHex}
        fontFamily={annotation.fontFamily ?? 'Helvetica'}
        fontStyle={
          `${annotation.bold ? 'bold' : ''} ${annotation.italic ? 'italic' : ''}`.trim() ||
          'normal'
        }
        textDecoration={annotation.underline ? 'underline' : ''}
        align={annotation.alignment ?? 'left'}
        width={annotation.width ? annotation.width * s : undefined}
        draggable
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDblClick={(e) => {
          e.cancelBubble = true;
          onRequestEdit();
        }}
        onDblTap={(e) => {
          e.cancelBubble = true;
          onRequestEdit();
        }}
        onDragEnd={(e) => {
          const nx = e.target.x();
          const ny = e.target.y();
          onChange({
            x: unscaleDelta(pageSpace, nx),
            y: unscaleDelta(pageSpace, ny),
          });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const sx = node.scaleX();
          const sy = node.scaleY();
          // Use the average scale for font size (so corner-drag scales
          // uniformly and looks natural). Width follows scaleX so users can
          // widen without changing text size via middle-left/right handles.
          const scaleAvg = (sx + sy) / 2;
          const newFontSize = Math.max(6, (annotation.fontSize * scaleAvg));
          const nodeWidth = Math.max(20, node.width() * sx);
          node.scaleX(1);
          node.scaleY(1);
          // Reset rotation applied by the transformer? For text we keep it
          // simple in v1 and ignore rotation on save (Konva still visually
          // rotates until save/reload).
          node.rotation(0);
          onChange({
            x: unscaleDelta(pageSpace, node.x()),
            y: unscaleDelta(pageSpace, node.y()),
            fontSize: newFontSize,
            width: unscaleDelta(pageSpace, nodeWidth),
          });
        }}
      />
      {isSelected && (
        <Rect
          listening={false}
          x={x - 4}
          y={y - 4}
          width={outlineWidth + 8}
          height={outlineHeight + 8}
          stroke="#0A66FF"
          strokeWidth={3}
          cornerRadius={4}
        />
      )}
      {isSelected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={true}
          keepRatio={false}
          // All 8 handles enabled:
          //   - corner handles (top-left/top-right/bottom-left/bottom-right):
          //     scale text uniformly (font size + width)
          //   - middle-left/middle-right: change width only (text re-wraps)
          //   - middle-top/middle-bottom: change font size only
          enabledAnchors={[
            'top-left',
            'top-center',
            'top-right',
            'middle-left',
            'middle-right',
            'bottom-left',
            'bottom-center',
            'bottom-right',
          ]}
          anchorSize={12}
          anchorStroke="#0A66FF"
          anchorFill="#FFFFFF"
          anchorCornerRadius={3}
          borderStroke="#0A66FF"
          borderDash={[4, 4]}
          boundBoxFunc={(oldBox, newBox) => {
            // Don't allow shrinking below a minimum readable size.
            if (newBox.width < 20 || newBox.height < 12) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
