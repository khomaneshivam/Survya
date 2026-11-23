import { lazy } from 'react';

/**
 * Enhanced React.lazy wrapper with deployment chunk-mismatch auto-recovery.
 * When Vite deploys a new build, older client tabs requesting outdated chunk hashes
 * fail with ChunkLoadError or "Failed to fetch dynamically imported module".
 * This wrapper automatically reloads the window (throttled to once every 15s) to load the new build.
 */
export function lazyWithRetry(componentImport) {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      const isChunkError =
        error?.name === 'ChunkLoadError' ||
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.message?.includes('Expected a JavaScript-or-Wasm module script') ||
        error?.message?.includes('error loading dynamically imported module') ||
        error?.message?.includes('Loading chunk') ||
        error?.message?.includes('Failed to load module script');

      if (isChunkError && typeof window !== 'undefined') {
        const lastReload = sessionStorage.getItem('sarvya_chunk_reload');
        const now = Date.now();
        // Prevent infinite reload loops - reload at most once every 15 seconds
        if (!lastReload || now - Number(lastReload) > 15000) {
          sessionStorage.setItem('sarvya_chunk_reload', String(now));
          window.location.reload();
          // Return a hanging promise while the page reloads
          return new Promise(() => {});
        }
      }
      throw error;
    }
  });
}

export default lazyWithRetry;

