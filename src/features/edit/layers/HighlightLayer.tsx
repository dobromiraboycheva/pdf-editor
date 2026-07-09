import { useEffect, useRef } from 'react';
import { Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { HighlightAnnotation } from '../annotationTypes';
import type { PageSpace } from '../pdfSpaceMap';
import { pdfToCanvas, scaleFactor, unscaleDelta } from '../pdfSpaceMap';

interface Props {
  annotation: HighlightAnnotation;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<HighlightAnnotation>) => void;
  pageSpace: PageSpace;
}

export function HighlightLayer({
  annotation,
  isSelected,
  onSelect,
  onChange,
  pageSpace,
}: Props) {
  const shapeRef = useRef<Konva.Rect | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const s = scaleFactor(pageSpace);

  useEffect(() => {
    if (isSelected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const { x, y } = pdfToCanvas(pageSpace, annotation.x, annotation.y);
  const w = annotation.width * s;
  const h = annotation.height * s;

  return (
    <>
      <Rect
        ref={shapeRef}
        x={x}
        y={y}
        width={w}
        height={h}
        fill={annotation.colorHex}
        opacity={0.4}
        draggable
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDragEnd={(e) => {
          onChange({
            x: unscaleDelta(pageSpace, e.target.x()),
            y: unscaleDelta(pageSpace, e.target.y()),
          });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: unscaleDelta(pageSpace, node.x()),
            y: unscaleDelta(pageSpace, node.y()),
            width: unscaleDelta(pageSpace, Math.max(4, node.width() * sx)),
            height: unscaleDelta(pageSpace, Math.max(4, node.height() * sy)),
          });
        }}
      />
      {isSelected && (
        <Rect
          listening={false}
          x={x - 3}
          y={y - 3}
          width={w + 6}
          height={h + 6}
          stroke="#0A66FF"
          strokeWidth={3}
          cornerRadius={4}
        />
      )}
      {isSelected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          anchorSize={12}
          anchorStroke="#0A66FF"
          anchorFill="#FFFFFF"
          anchorCornerRadius={3}
          borderStroke="#0A66FF"
        />
      )}
    </>
  );
}
