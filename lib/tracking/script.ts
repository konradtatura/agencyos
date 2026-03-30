/**
 * GHL funnel tracking script.
 *
 * Paste this into every GHL funnel page's <head> or custom code block.
 * - Fires immediately (no DOMContentLoaded wait) to avoid GHL blocking events
 * - Uses fetch + keepalive instead of sendBeacon to avoid CORS issues
 * - credentials: 'omit' prevents preflight failures on cross-origin requests
 */

export const BASE_URL = 'https://agencyos-production-e20e.up.railway.app'

export function getTrackingScript(locationId: string): string {
  return `<script>
(function () {
  var BASE_URL = '${BASE_URL}';
  var LOCATION_ID = '${locationId}';

  function getSessionId() {
    var key = 'agos_sid';
    var sid = sessionStorage.getItem(key);
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(key, sid);
    }
    return sid;
  }

  function getDeviceType() {
    var ua = navigator.userAgent;
    if (/iPhone|Android|Mobile/i.test(ua)) return 'mobile';
    if (/iPad|Tablet/i.test(ua)) return 'tablet';
    return 'desktop';
  }

  function getReferrerSource() {
    var ref = document.referrer || '';
    if (!ref) return 'direct';
    if (ref.indexOf('instagram') !== -1) return 'instagram';
    if (ref.indexOf('facebook') !== -1 || ref.indexOf('fb') !== -1) return 'facebook';
    if (ref.indexOf('google') !== -1) return 'google';
    if (ref.indexOf('tiktok') !== -1) return 'tiktok';
    return 'other';
  }

  var startTime = Date.now();
  var sid = getSessionId();

  fetch(BASE_URL + '/api/track/pageview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    keepalive: true,
    body: JSON.stringify({
      location_id: LOCATION_ID,
      page_path: window.location.pathname,
      page_name: document.title || window.location.pathname,
      session_id: sid,
      referrer: document.referrer || '',
      visited_at: new Date().toISOString(),
      device_type: getDeviceType(),
      referrer_source: getReferrerSource(),
    })
  }).catch(function () {});

  window.addEventListener('beforeunload', function () {
    var seconds = Math.round((Date.now() - startTime) / 1000);
    fetch(BASE_URL + '/api/track/pageleave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      keepalive: true,
      body: JSON.stringify({
        session_id: sid,
        page_path: window.location.pathname,
        time_on_page_seconds: seconds,
      })
    }).catch(function () {});
  });
})();
</script>`
}
