import { create } from 'zustand';

/**
 * Tiny global store controlling the keyboard-shortcuts help modal.
 *
 * Shared so both the AppHeader `?` button and the global `?` keydown listener
 * (wired in App.tsx) can open/close the same dialog.
 */
interface ShortcutsHelpState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useShortcutsHelp = create<ShortcutsHelpState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
