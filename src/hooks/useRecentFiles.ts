import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Recent-files store, persisted to localStorage under `pdf-editor.recent-files`.
 *
 * PRIVACY: we store ONLY metadata (name, size, timestamp) — never the file
 * contents. The file itself is never persisted. Recents are a convenience
 * label / memory aid: clicking one just re-opens the file picker so the user
 * can pick that file again. Browsers cannot re-open a file by path without a
 * fresh user gesture, so we deliberately do not (and cannot) auto-load.
 */
export interface RecentFile {
  name: string;
  size: number;
  lastOpened: number;
}

const MAX_RECENT = 8;

interface RecentFilesState {
  recent: RecentFile[];
  addRecent: (file: { name: string; size: number }) => void;
  clearRecent: () => void;
}

export const useRecentFiles = create<RecentFilesState>()(
  persist(
    (set) => ({
      recent: [],
      addRecent: (file) =>
        set((state) => {
          const entry: RecentFile = {
            name: file.name,
            size: file.size,
            lastOpened: Date.now(),
          };
          // Dedupe by name+size, then prepend (most-recent first) and cap.
          const deduped = state.recent.filter(
            (r) => !(r.name === entry.name && r.size === entry.size),
          );
          return { recent: [entry, ...deduped].slice(0, MAX_RECENT) };
        }),
      clearRecent: () => set({ recent: [] }),
    }),
    { name: 'pdf-editor.recent-files' },
  ),
);
