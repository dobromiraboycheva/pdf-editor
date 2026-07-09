import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { registerPwa } from './lib/pwa/registerPwa';
import './i18n'; // Initialize i18next before any React rendering
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// Register the service worker for PWA installability (browser builds only; no-op in Tauri).
registerPwa();
