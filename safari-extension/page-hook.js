(() => {
  'use strict';
  if (window.__tripflowMapsHook) return;
  window.__tripflowMapsHook = true;
  const eventName = 'tripflow-maps-observation';

  function publish(places) {
    if (places.length) document.dispatchEvent(new CustomEvent(eventName, { detail: { places } }));
  }

  function scan(value, source) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (!text || text.length > 20_000_000) return;
    const decoded = text.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    const places = [];
    const pattern = /https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\/place\/([^/?#"'\\]+)[^"'\\\s<>]*/gi;
    for (const match of decoded.matchAll(pattern)) {
      let title = match[1];
      try { title = decodeURIComponent(title).replace(/\+/g, ' '); } catch {}
      places.push({ title, mapUrl: match[0], source });
      if (places.length >= 200) break;
    }
    publish(places);
  }

  // This is deliberately bounded. Walking every property can trigger getters and freeze Maps.
  for (const key of ['APP_INITIALIZATION_STATE', 'APP_OPTIONS', '_pageData']) {
    try { if (window[key] != null) scan(window[key], `global:${key}`); } catch {}
  }

  const nativeFetch = window.fetch;
  window.fetch = async function tripflowFetch(...args) {
    const response = await nativeFetch.apply(this, args);
    try {
      const url = String(response.url || args[0]);
      if (/google\.[^/]+\/maps|\/maps\/_\/MapsUi/i.test(url)) scan(await response.clone().text(), 'fetch');
    } catch {}
    return response;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function tripflowOpen(method, url, ...rest) {
    this.__tripflowUrl = String(url);
    this.addEventListener('load', function tripflowLoad() {
      try {
        if (/google\.[^/]+\/maps|\/maps\/_\/MapsUi/i.test(this.__tripflowUrl) && typeof this.responseText === 'string') {
          scan(this.responseText, 'xhr');
        }
      } catch {}
    }, { once: true });
    return nativeOpen.call(this, method, url, ...rest);
  };
})();
