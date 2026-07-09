import { create } from 'zustand';
import type {
  WatermarkKind,
  WatermarkPosition,
} from './watermarkProcessor';

interface WatermarkState {
  kind: WatermarkKind;
  text: string;
  fontSize: number;
  colorHex: string;
  opacity: number;
  angleDeg: number;
  position: WatermarkPosition;
  image: File | null;
  imageScale: number;

  setKind: (kind: WatermarkKind) => void;
  setText: (text: string) => void;
  setFontSize: (size: number) => void;
  setColorHex: (color: string) => void;
  setOpacity: (opacity: number) => void;
  setAngleDeg: (angle: number) => void;
  setPosition: (position: WatermarkPosition) => void;
  setImage: (file: File | null) => void;
  setImageScale: (scale: number) => void;
}

export const useWatermarkStore = create<WatermarkState>((set) => ({
  kind: 'text',
  text: 'CONFIDENTIAL',
  fontSize: 48,
  colorHex: '#FF0000',
  opacity: 0.3,
  angleDeg: -30,
  position: 'center',
  image: null,
  imageScale: 0.35,

  setKind: (kind) => set({ kind }),
  setText: (text) => set({ text }),
  setFontSize: (fontSize) => set({ fontSize }),
  setColorHex: (colorHex) => set({ colorHex }),
  setOpacity: (opacity) => set({ opacity }),
  setAngleDeg: (angleDeg) => set({ angleDeg }),
  setPosition: (position) => set({ position }),
  setImage: (image) => set({ image }),
  setImageScale: (imageScale) => set({ imageScale }),
}));
