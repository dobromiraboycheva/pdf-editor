import { useEffect, useRef, useState } from 'react';
import { Image as KonvaImage, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { ImageAnnotation } from '../annotationTypes';
import type { PageSpace } from '../pdfSpaceMap';
import { pdfToCanvas, scaleFactor, unscaleDelta } from '../pdfSpaceMap';

interface Props {
  annotation: ImageAnnotation;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<ImageAnnotation>) => void;
  pageSpace: PageSpace;
}

/** HTMLImageElement is loaded once per data URL and memoized on the annotation id. */
export function ImageLayer({
  annotation,
  isSelected,
  onSelect,
  onChange,
  pageSpace,
}: Props) {
  const shapeRef = useRef<Konva.Image | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const [htmlImg, setHtmlImg] = useState<HTMLImageElement | null>(null);
  const s = scaleFactor(pageSpace);

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = annotation.dataUrl;
    img.onload = () => setHtmlImg(img);
    return () => {
      img.onload = null;
    };
  }, [annotation.dataUrl]);

  useEffect(() => {
    if (isSelected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const { x, y } = pdfToCanvas(pageSpace, annotation.x, annotation.y);
  const w = annotation.width * s;
  const h = annotation.height * s;

  if (!htmlImg) return null;

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        image={htmlImg}
        x={x}
        y={y}
        width={w}
        height={h}
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
            width: unscaleDelta(pageSpace, Math.max(4, w * sx)),
            height: unscaleDelta(pageSpace, Math.max(4, h * sy)),
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
          keepRatio
          anchorSize={12}
          anchorStroke="#0A66FF"
          anchorFill="#FFFFFF"
          anchorCornerRadius={3}
          borderStroke="#0A66FF"
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 10 || newBox.height < 10) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
