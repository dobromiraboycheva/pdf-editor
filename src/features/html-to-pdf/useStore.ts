import { create } from 'zustand';

export type HtmlToPdfSource = 'url' | 'html';
export type HtmlToPdfPageSize = 'a4' | 'letter';

interface HtmlToPdfState {
  source: HtmlToPdfSource;
  url: string;
  html: string;
  pageSize: HtmlToPdfPageSize;
  setSource: (source: HtmlToPdfSource) => void;
  setUrl: (url: string) => void;
  setHtml: (html: string) => void;
  setPageSize: (pageSize: HtmlToPdfPageSize) => void;
}

export const useHtmlToPdfStore = create<HtmlToPdfState>((set) => ({
  source: 'url',
  url: '',
  html: '',
  pageSize: 'a4',
  setSource: (source) => set({ source }),
  setUrl: (url) => set({ url }),
  setHtml: (html) => set({ html }),
  setPageSize: (pageSize) => set({ pageSize }),
}));
