import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// APP_VERSION: increment on each deploy to force PWA cache refresh
const APP_VERSION = '14';

if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('letsHuntVersion');
  if (stored !== APP_VERSION) {
    localStorage.setItem('letsHuntVersion', APP_VERSION);
    if (stored !== null) {
      // Hard reload to bust all caches
      window.location.reload();
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);