import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// APP_VERSION: increment on each deploy to force PWA cache refresh
const APP_VERSION = '34';

if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('letsHuntVersion');
  if (stored !== APP_VERSION) {
    localStorage.setItem('letsHuntVersion', APP_VERSION);
    if (stored !== null) {
      // Hard reload to bust all caches
      window.location.reload();
    }
  }

  // Register the service worker: required for PWA installability, offline
  // support, and reliable notification display. Android (especially installed
  // PWAs) suppresses page-context `new Notification()`, so alerts must be
  // shown through the service worker registration.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);