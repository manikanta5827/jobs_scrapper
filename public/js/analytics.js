/**
 * Shared Analytics Tracker for Job Scraper Platform
 * Unified tracking helper imported by redirect.html, resume.html, and dashboard.html
 */
(function(global) {
  const API_ENDPOINT = 'https://mt07rx0ojd.execute-api.ap-south-1.amazonaws.com/Prod/analytics/click';

  function trackClick(params) {
    const { jobId, userId, source, type } = params || {};
    if (!source || !type || (!jobId && !userId)) return;

    const payload = JSON.stringify({ jobId, userId, source, type });

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
