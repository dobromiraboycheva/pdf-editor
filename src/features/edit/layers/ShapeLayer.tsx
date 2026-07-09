import { useEffect, useRef } from 'react';
import { Rect, Ellipse, Line, Arrow, Transformer } from 'react-konva';
import type Konva from 'konva';
import type {
  AnnotationPatch,
  ArrowAnnotation,
  EllipseAnnotation,
  LineAnnotation,
  RectAnnotation,
} from '../annotationTypes';
import type { PageSpace } from '../pdfSpaceMap';
import { pdfToCanvas, scaleFactor, unscaleDelta } from '../pdfSpaceMap';

interface Props {
  annotation:
    | RectAnnotation
    | EllipseAnnotation
    | LineAnnotation
    | ArrowAnnotation;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (patch: AnnotationPatch) => void;
  pageSpace: PageSpace;
}

/** Dispatches to the correct Konva primitive based on annotation.kind. */
export function ShapeLayer({
  annotation,
  isSelected,
  onSelect,
  onChange,
  pageSpace,
}: Props) {
  const shapeRef = useRef<Konva.Shape | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const s = scaleFactor(pageSpace);

  useEffect(() => {
    if (isSelected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  // When selected, bump stroke width and add a subtle blue halo so the
  // selection is unmistakable even when the shape's own stroke is thin/light.
  const effectiveStrokeWidth =
    (isSelected ? annotation.strokeWidth + 1 : annotation.strokeWidth) * s;
  const common = {
    stroke: annotation.strokeHex,
    strokeWidth: effectiveStrokeWidth,
    opacity: annotation.opacity,
    draggable: true,
    shadowEnabled: isSelected,
    shadowColor: '#0A66FF',
    shadowBlur: isSelected ? 8 : 0,
    shadowOpacity: isSelected ? 0.55 : 0,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      onSelect();
    },
  };

  if (annotation.kind === 'rect' || annotation.kind === 'ellipse') {
    const boxAnn = annotation;
    const { x: cx, y: cy } = pdfToCanvas(pageSpace, boxAnn.x, boxAnn.y);
    const w = boxAnn.width * s;
    const h = boxAnn.height * s;
    const fill = boxAnn.fillHex ?? undefined;

    const handleTransformEnd = () => {
      const node = shapeRef.current;
      if (!node) return;
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      const newX = unscaleDelta(pageSpace, node.x());
      const newY = unscaleDelta(pageSpace, node.y());
      const newW = unscaleDelta(pageSpace, Math.max(4, node.width() * sx));
      const newH = unscaleDelta(pageSpace, Math.max(4, node.height() * sy));
      onChange({ x: newX, y: newY, width: newW, height: newH });
    };

    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
      onChange({
        x: unscaleDelta(pageSpace, e.target.x()),
        y: unscaleDelta(pageSpace, e.target.y()),
      });
    };

    if (annotation.kind === 'rect') {
      return (
        <>
          <Rect
            {...common}
            ref={(r) => {
              shapeRef.current = r;
            }}
            x={cx}
            y={cy}
            width={w}
            height={h}
            fill={fill}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          />
          {isSelected && (
            <Rect
              listening={false}
              x={cx - 4}
              y={cy - 4}
              width={w + 8}
              height={h + 8}
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

    // Ellipse — Konva positions from center; we store top-left box.
    return (
      <>
        <Ellipse
          {...common}
          ref={(r) => {
            shapeRef.current = r;
          }}
          x={cx + w / 2}
          y={cy + h / 2}
          radiusX={w / 2}
          radiusY={h / 2}
          fill={fill}
          onDragEnd={(e) => {
            // Convert center back to top-left before storing.
            const nx = unscaleDelta(pageSpace, e.target.x()) - boxAnn.width / 2;
            const ny = unscaleDelta(pageSpace, e.target.y()) - boxAnn.height / 2;
            onChange({ x: nx, y: ny });
          }}
          onTransformEnd={() => {
            const node = shapeRef.current;
            if (!node) return;
            const sx = node.scaleX();
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            const newW = unscaleDelta(pageSpace, Math.max(4, w * sx));
            const newH = unscaleDelta(pageSpace, Math.max(4, h * sy));
            const newX = unscaleDelta(pageSpace, node.x()) - newW / 2;
            const newY = unscaleDelta(pageSpace, node.y()) - newH / 2;
            onChange({ x: newX, y: newY, width: newW, height: newH });
          }}
        />
        {isSelected && (
          <Rect
            listening={false}
            x={cx - 4}
            y={cy - 4}
            width={w + 8}
            height={h + 8}
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

  // Line / Arrow — endpoint-based.
  const p1 = pdfToCanvas(pageSpace, annotation.x1, annotation.y1);
  const p2 = pdfToCanvas(pageSpace, annotation.x2, annotation.y2);
  const points = [p1.x, p1.y, p2.x, p2.y];

  const handleLineDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const dx = unscaleDelta(pageSpace, e.target.x());
    const dy = unscaleDelta(pageSpace, e.target.y());
    e.target.x(0);
    e.target.y(0);
    onChange({
      x1: annotation.x1 + dx,
      y1: annotation.y1 + dy,
      x2: annotation.x2 + dx,
      y2: annotation.y2 + dy,
    });
  };

  if (annotation.kind === 'line') {
    return (
      <>
        <Line
          {...common}
          ref={(r) => {
            shapeRef.current = r;
          }}
          points={points}
          lineCap="round"
          lineJoin="round"
          onDragEnd={handleLineDragEnd}
        />
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

  // Arrow
  return (
    <>
      <Arrow
        {...common}
        ref={(r) => {
          shapeRef.current = r;
        }}
        points={points}
        fill={annotation.strokeHex}
        pointerLength={Math.max(6, annotation.strokeWidth * 3 * s)}
        pointerWidth={Math.max(6, annotation.strokeWidth * 3 * s)}
        onDragEnd={handleLineDragEnd}
      />
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
