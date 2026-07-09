/// <reference types="vite/client" />

// Ambient declaration for the virtual module injected by vite-plugin-pwa.
// Kept local so the app typechecks even before `npm install` pulls the plugin in.
// Once vite-plugin-pwa is installed you may instead reference "vite-plugin-pwa/client".
declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (
      swScriptUrl: string,
      registration: ServiceWorkerRegistration | undefined,
    ) => void;
    onRegisterError?: (error: unknown) => void;
  }
  export function registerSW(
    options?: RegisterSWOptions,
  ): (reloadPage?: boolean) => Promise<void>;
}
