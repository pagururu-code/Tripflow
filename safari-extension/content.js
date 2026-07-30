(() => {
  'use strict';

  const BRIDGE_EVENT = 'tripflow-maps-observation';
  const observations = [];
  const observedKeys = new Set();

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function canonicalMapUrl(raw) {
    try {
      const url = new URL(raw, location.origin);
      if (!/(^|\.)google\.[a-z.]+$/i.test(url.hostname)) return '';
      if (!url.pathname.includes('/maps/place/')) return '';
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) {
        if (key.startsWith('utm_') || ['entry', 'g_ep', 'authuser', 'hl'].includes(key)) {
          url.searchParams.delete(key);
        }
      }
      return url.toString();
    } catch {
      return '';
    }
  }

  function titleFromLink(anchor, url) {
    const labelled = clean(anchor.getAttribute('aria-label'));
    if (labelled && !/^(길찾기|directions|웹사이트|website)/i.test(labelled)) return labelled;

    const card = anchor.closest('[role="article"], [role="feed"] > div, .Nv2PK, [data-result-index]');
    const heading = card?.querySelector('[role="heading"], h1, h2, h3, .fontHeadlineSmall');
    if (clean(heading?.textContent)) return clean(heading.textContent);

    const match = new URL(url).pathname.match(/\/maps\/place\/([^/]+)/);
    try { return clean(decodeURIComponent(match?.[1] || '').replace(/\+/g, ' ')); }
    catch { return clean(match?.[1]); }
  }

  function addPlace(map, title, rawUrl, source) {
    const mapUrl = canonicalMapUrl(rawUrl);
    const name = clean(title);
    if (!mapUrl || !name || name.length > 200) return;
    const key = `${name.toLocaleLowerCase()}|${mapUrl}`;
    if (!map.has(key)) map.set(key, { title: name, mapUrl, source });
  }

  function extractDom() {
    const places = new Map();
    document.querySelectorAll('a[href*="/maps/place/"]').forEach(anchor => {
      const mapUrl = canonicalMapUrl(anchor.href);
      addPlace(places, titleFromLink(anchor, mapUrl), mapUrl, 'dom');
    });
    return [...places.values()];
  }

  function remember(items) {
    for (const item of items || []) {
      const mapUrl = canonicalMapUrl(item.mapUrl);
      const title = clean(item.title);
      const key = `${title.toLocaleLowerCase()}|${mapUrl}`;
      if (title && mapUrl && !observedKeys.has(key)) {
        observedKeys.add(key);
        observations.push({ title, mapUrl, source: item.source || 'network' });
      }
    }
  }

  async function extractWithScroll() {
    const feed = document.querySelector('[role="feed"]');
    const originalScrollTop = feed?.scrollTop || 0;
    let stableRounds = 0;
    let previousCount = 0;
    const found = new Map();

    for (let round = 0; round < 120 && stableRounds < 5; round += 1) {
      extractDom().forEach(place => addPlace(found, place.title, place.mapUrl, 'dom'));
      if (found.size === previousCount) stableRounds += 1;
      else stableRounds = 0;
      previousCount = found.size;
      if (!feed) break;
      feed.scrollTop = feed.scrollHeight;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (feed) feed.scrollTop = originalScrollTop;
    return [...found.values()];
  }

  function expectedCount() {
    const candidates = [...document.querySelectorAll('h1, h2, [role="main"]')]
      .map(node => clean(node.textContent).match(/(?:^|\s)(\d{1,4})\s*(?:개|places?|장소)/i)?.[1])
      .filter(Boolean)
      .map(Number);
    return candidates.length ? Math.max(...candidates) : null;
  }

  document.addEventListener(BRIDGE_EVENT, event => remember(event.detail?.places));

  const hook = document.createElement('script');
  hook.src = browser.runtime.getURL('page-hook.js');
  hook.onload = () => hook.remove();
  (document.documentElement || document).appendChild(hook);

  browser.runtime.onMessage.addListener(message => {
    if (message?.type !== 'TRIPFLOW_EXTRACT') return undefined;
    return extractWithScroll().then(domPlaces => {
      const merged = new Map();
      [...domPlaces, ...observations].forEach(place => addPlace(merged, place.title, place.mapUrl, place.source));
      const expected = expectedCount();
      return {
        places: [...merged.values()],
        expected,
        diagnostics: {
          dom: domPlaces.length,
          observed: observations.length,
          feedFound: Boolean(document.querySelector('[role="feed"]')),
          url: location.href,
          complete: expected == null || merged.size >= expected
        }
      };
    });
  });
})();
