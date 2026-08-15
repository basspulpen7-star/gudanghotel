import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const APP_VERSION = '2026.08.15.01';
console.log('[APP VERSION]', APP_VERSION);

// Service Worker Registration & Stale Cache Eviction
if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // In development mode, unregister any active service worker so hot reloading works directly
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
  } else {
    window.addEventListener('load', () => {
      // Clean up legacy caches (e.g. gudang-alia-v1) immediately from browser storage
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            if (key !== `warehouse-v${APP_VERSION}`) {
              console.log('[App] Removing stale cache:', key);
              caches.delete(key);
            }
          });
        });
      }

      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((registration) => {
          console.log('[SW] Registered successfully:', registration);

          // Check for service worker updates
          registration.update();

          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;

            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('[SW] New version available! Activating...');
                  installingWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              }
            };
          };
        })
        .catch((error) => {
          console.error('[SW] Registration failed:', error);
        });

      // Reload page once when controller changes to ensure fresh UI assets
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

