/**
 * Shared Analytics Tracker for Job Scraper Platform
 * Unified tracking helper imported by redirect.html, resume.html, and dashboard.html
 */
(function(global) {
  const API_ENDPOINT = '/analytics/click';

  function trackClick(params) {
    const { jobId, userId, source, type } = params || {};
    if (!source || !type || (!jobId && !userId)) return;

    const payload = JSON.stringify({ jobId, userId, source, type });

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try {
        const blob = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon(API_ENDPOINT, blob)) {
          return;
        }
      } catch (e) {
        // Fallback to fetch if sendBeacon throws exception
      }
    }

    if (typeof fetch !== 'undefined') {
      fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(err => console.error('Analytics tracking error:', err));
    }
  }

  global.JobAnalytics = { trackClick };
})(typeof window !== 'undefined' ? window : this);
