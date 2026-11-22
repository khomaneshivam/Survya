import { useEffect } from 'react';

/**
 * Custom React hook to update page title, description, and search engine robots meta tag.
 * Sets noindex, nofollow on authenticated / private pages (e.g. dashboard, inbox, c/:slug, x/:slug)
 * and index, follow on public pages.
 */
export function usePageMeta({
  title,
  description,
  noindex = false,
  canonical = null
} = {}) {
  useEffect(() => {
    // 1. Update Document Title
    const baseTitle = 'SARVYA — Zero-Markup WhatsApp Business API CRM & Automation';
    if (title) {
      document.title = `${title} | SARVYA`;
    } else {
      document.title = baseTitle;
    }

    // 2. Update Meta Description
    if (description) {
      let descEl = document.querySelector('meta[name="description"]');
      if (!descEl) {
        descEl = document.createElement('meta');
        descEl.setAttribute('name', 'description');
        document.head.appendChild(descEl);
      }
      descEl.setAttribute('content', description);
    }

    // 3. Update Robots Meta Tag
    let robotsEl = document.querySelector('meta[name="robots"]');
    if (!robotsEl) {
      robotsEl = document.createElement('meta');
      robotsEl.setAttribute('name', 'robots');
      document.head.appendChild(robotsEl);
    }
    robotsEl.setAttribute('content', noindex ? 'noindex, nofollow' : 'index, follow');

    // 4. Update Canonical Link
    if (canonical) {
      let canonEl = document.querySelector('link[rel="canonical"]');
      if (!canonEl) {
        canonEl = document.createElement('link');
        canonEl.setAttribute('rel', 'canonical');
        document.head.appendChild(canonEl);
      }
      canonEl.setAttribute('href', canonical);
    }
  }, [title, description, noindex, canonical]);
}

export default usePageMeta;
