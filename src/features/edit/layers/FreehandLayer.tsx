import { useEffect, useMemo, useRef } from 'react';
import { Line, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { FreehandAnnotation } from '../annotationTypes';
import type { PageSpace } from '../pdfSpaceMap';
import { pdfToCanvas, scaleFactor, unscaleDelta } from '../pdfSpaceMap';

interface Props {
  annotation: FreehandAnnotation;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<FreehandAnnotation>) => void;
  pageSpace: PageSpace;
}

/**
 * Simple `<Line tension>` rendering. We opted against `perfect-freehand`'s
 * pressure outline for the v1 look — the resulting Konva shape is more
 * intuitive to select/drag and maps cleanly to a pdf-lib SVG path at save
 * time.
 */
export function FreehandLayer({
  annotation,
  isSelected,
  onSelect,
  onChange,
  pageSpace,
}: Props) {
  const shapeRef = useRef<Konva.Line | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const s = scaleFactor(pageSpace);

  useEffect(() => {
    if (isSelected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const flat: number[] = [];
  for (const p of annotation.points) {
    const c = pdfToCanvas(pageSpace, p.x, p.y);
    flat.push(c.x, c.y);
  }

  // Bounding box of the stroke in canvas pixels — used for the selection
  // outline. Padded a hair so the dashed rect doesn't clip the stroke.
  const bbox = useMemo(() => {
    if (annotation.points.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of annotation.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const tl = pdfToCanvas(pageSpace, minX, minY);
    const br = pdfToCanvas(pageSpace, maxX, maxY);
    return {
      x: tl.x,
      y: tl.y,
      width: Math.max(4, br.x - tl.x),
      height: Math.max(4, br.y - tl.y),
    };
  }, [annotation.points, pageSpace]);

  return (
    <>
      <Line
        ref={shapeRef}
        points={flat}
        stroke={annotation.strokeHex}
        strokeWidth={annotation.strokeWidth * s}
        tension={0.35}
        lineCap="round"
        lineJoin="round"
        opacity={annotation.opacity}
        draggable
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDragEnd={(e) => {
          const dx = unscaleDelta(pageSpace, e.target.x());
          const dy = unscaleDelta(pageSpace, e.target.y());
          e.target.x(0);
          e.target.y(0);
          onChange({
            points: annotation.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          });
        }}
      />
      {isSelected && bbox && (
        <Rect
          listening={false}
          x={bbox.x - 6}
          y={bbox.y - 6}
          width={bbox.width + 12}
          height={bbox.height + 12}
          stroke="#0A66FF"
          strokeWidth={3}
          cornerRadius={4}
        />
      )}
      {isSelected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          resizeEnabled={false}
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
