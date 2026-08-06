/// <reference types="vite/client" />

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import {safeGetString, safeSet} from './utils/storage';
import './index.css';

// APP_VERSION: increment on each deploy to force PWA cache refresh
const APP_VERSION = '40';

if (typeof window !== 'undefined') {
  const stored = safeGetString('letsHuntVersion');
  if (stored !== APP_VERSION) {
    const wrote = safeSet('letsHuntVersion', APP_VERSION);
    if (stored !== null && wrote) {
      // Hard reload to bust all caches
      window.location.reload();
    }
  }

  // Register the service worker: required for PWA installability, offline
  // support, and reliable notification display. Android (especially installed
  // PWAs) suppresses page-context `new Notification()`, so alerts must be
  // shown through the service worker registration.
  // Skipped in dev: the service worker's cache-first asset handling would
  // otherwise serve stale modules and break Vite HMR (a classic cause of
  // "my new code isn't showing up" while developing).
  if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);