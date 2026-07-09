import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ClaudeModel =
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-5';

export type SummarizeProvider = 'local' | 'anthropic';

interface ApiKeyState {
  anthropicKey: string;
  googleKey: string;
  model: ClaudeModel;
  summarizeProvider: SummarizeProvider;
  setKey: (k: string) => void;
  setGoogleKey: (k: string) => void;
  setModel: (m: ClaudeModel) => void;
  setSummarizeProvider: (p: SummarizeProvider) => void;
  clear: () => void;
}

export const useApiKeyStore = create<ApiKeyState>()(
  persist(
    (set) => ({
      anthropicKey: '',
      googleKey: '',
      model: 'claude-haiku-4-5-20251001',
      summarizeProvider: 'local',
      setKey: (anthropicKey) => set({ anthropicKey }),
      setGoogleKey: (googleKey) => set({ googleKey }),
      setModel: (model) => set({ model }),
      setSummarizeProvider: (summarizeProvider) => set({ summarizeProvider }),
      clear: () => set({ anthropicKey: '', googleKey: '' }),
    }),
    { name: 'pdf-editor.ai-key' },
  ),
);
