// ── STREAM by RISHI — Ad Blocker Service Worker ──
const VERSION = 'v1';

// Ad network domains to block entirely
const BLOCKED_DOMAINS = [
  'exoclick.com',
  'popads.net',
  'adsterra.com',
  'propellerads.com',
  'trafficjunky.com',
  'juicyads.com',
  'adcash.com',
  'hilltopads.com',
  'realsrv.com',
  'adnxs.com',
  'doubleclick.net',
  'googlesyndication.com',
  'googletagmanager.com',
  'outbrain.com',
  'taboola.com',
  'popcash.net',
  'popunder.ru',
  'clickadu.com',
  'adtelligent.com',
  'bidgear.com',
  'runnr.ai',
  'adspyglass.com',
  'adskeeper.co.uk',
  'pushcrew.com',
  'onesignal.com',
  'truepush.com',
  'pushassist.com',
  'subscribers.com',
];

// Script src patterns to block
const BLOCKED_SCRIPT_PATTERNS = [
  /exoclick/i,
  /popads/i,
  /adsterra/i,
  /propellerads/i,
  /trafficjunky/i,
  /juicyads/i,
  /adcash/i,
  /hilltopads/i,
  /realsrv/i,
  /adnxs/i,
  /doubleclick/i,
  /googlesyndication/i,
  /googletagmanager/i,
  /outbrain/i,
  /taboola/i,
  /popcash/i,
  /clickadu/i,
  /push.*notification/i,
  /onesignal/i,
  /truepush/i,
];

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Block requests to ad domains entirely — return empty response
  if (BLOCKED_DOMAINS.some(d => url.hostname.includes(d))) {
    e.respondWith(new Response('', {
      status: 200,
      headers: { 'Content-Type': 'text/javascript' }
    }));
    return;
  }

  // For foulembeds HTML pages — intercept and strip ads
  if (url.hostname.includes('foulembeds.live') && 
      (url.pathname.includes('/embed/') || url.pathname.endsWith('.html'))) {
    e.respondWith(fetchAndStrip(e.request));
    return;
  }

  // For JS files loaded by foulembeds — check if they're ad scripts
  if (url.hostname.includes('foulembeds.live') && url.pathname.endsWith('.js')) {
    if (BLOCKED_SCRIPT_PATTERNS.some(p => p.test(url.href))) {
      e.respondWith(new Response('', {
        status: 200,
        headers: { 'Content-Type': 'text/javascript' }
      }));
      return;
    }
  }

  // Everything else — pass through normally
  e.respondWith(fetch(e.request));
});

async function fetchAndStrip(request) {
  try {
    const res = await fetch(request);
    const contentType = res.headers.get('content-type') || '';

    // Only process HTML
    if (!contentType.includes('text/html')) return res;

    let html = await res.text();

    // ── 1. Remove ad script tags by src ──
    html = html.replace(
      /<script[^>]+src=["']([^"']*?)["'][^>]*>[\s\S]*?<\/script>/gi,
      (match, src) => {
        if (BLOCKED_SCRIPT_PATTERNS.some(p => p.test(src))) return '';
        return match;
      }
    );

    // ── 2. Remove inline ad scripts by content ──
    html = html.replace(
      /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi,
      (match, content) => {
        const adKeywords = [
          'popunder', 'pop_under', 'window.open(', 'exoclick', 'popads',
          'adsterra', 'propellerads', 'juicyads', 'adcash', 'clickadu',
          'push_notification', 'OneSignal', 'checkAdBlock', 'adBlockDetect',
          'adsBlocked', 'new Date().getTime()', 'unescape(', 'eval(unescape',
        ];
        // Only block if MULTIPLE ad keywords — avoid false positives on player JS
        const hits = adKeywords.filter(k => content.includes(k)).length;
        if (hits >= 2) return '';
        // Block single strong indicators
        const strongAds = ['popunder', 'pop_under', 'eval(unescape', 'exoclick', 'popads.net'];
        if (strongAds.some(k => content.includes(k))) return '';
        return match;
      }
    );

    // ── 3. Block window.open pop-unders ──
    html = html.replace(/\bwindow\.open\s*\(/g, 'void(0,');

    // ── 4. Block forced redirects ──
    html = html.replace(/window\.location\s*=\s*(?!window)/g, 'void =');
    html = html.replace(/window\.location\.href\s*=\s*(?!window)/g, 'void =');
    html = html.replace(/document\.location\s*=\s*/g, 'void =');

    // ── 5. Remove ad iframes ──
    html = html.replace(
      /<iframe[^>]*src=["']([^"']*?)["'][^>]*>[\s\S]*?<\/iframe>/gi,
      (match, src) => {
        if (BLOCKED_SCRIPT_PATTERNS.some(p => p.test(src))) return '';
        return match;
      }
    );

    // ── 6. Remove push notification permission requests ──
    html = html.replace(/Notification\.requestPermission/g, 'void');
    html = html.replace(/serviceWorker\.register\([^)]*push[^)]*\)/gi, 'void(0)');

    const headers = new Headers(res.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    // Allow embedding
    headers.delete('X-Frame-Options');
    headers.delete('Content-Security-Policy');

    return new Response(html, {
      status: res.status,
      headers
    });

  } catch (err) {
    // If fetch fails, just pass through
    return fetch(request);
  }
}
