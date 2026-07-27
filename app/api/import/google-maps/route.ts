import { NextRequest, NextResponse } from 'next/server';

type PlaceResult = {
  id: string;
  title: string;
  address?: string;
  location?: { lat: number; lng: number };
  openingHours?: string[];
  mapUrl?: string;
};

type PlaceCandidate = {
  title: string;
  mapUrl?: string;
};

const cleanText = (value: string) =>
  value
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\u0027/g, "'")
    .replace(/\\u0022/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const unique = <T,>(items: T[], key: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter(item => {
    const value = key(item).toLocaleLowerCase();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

const isValidPlaceTitle = (rawValue: unknown): rawValue is string => {
  if (typeof rawValue !== 'string') return false;
  const value = cleanText(rawValue);
  if (value.length < 2 || value.length > 160) return false;
  if (!/[\p{L}\p{N}]/u.test(value)) return false;
  if (/^[\d\s.,/★☆⭐·•()\-+:%]+$/u.test(value)) return false;

  const rejectedPatterns = [
    /^별표\s*평점\s*:/i,
    /^리뷰\s*[\d,.]+\s*개?$/i,
    /^주소\s*정보\s*없음$/i,
    /^이미\s*있음$/i,
    /^\d(?:\.\d)?\s*\/\s*5$/,
    /^(google|google maps|maps|지도|목록|저장|공유|로그인|검색)$/i,
  ];

  return !rejectedPatterns.some(pattern => pattern.test(value));
};

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const normalizeType = (value: unknown) => (Array.isArray(value) ? value : [value]).filter(Boolean);

const isItemList = (value: unknown) =>
  normalizeType(value).some(type => typeof type === 'string' && type.toLowerCase() === 'itemlist');

function collectItemLists(node: unknown, output: Record<string, unknown>[], visited = new Set<object>()) {
  if (!node || typeof node !== 'object') return;
  if (visited.has(node as object)) return;
  visited.add(node as object);

  if (Array.isArray(node)) {
    for (const item of node) collectItemLists(item, output, visited);
    return;
  }

  const record = node as Record<string, unknown>;
  if (isItemList(record['@type'])) output.push(record);

  for (const value of Object.values(record)) {
    collectItemLists(value, output, visited);
  }
}

function getCandidateFromListEntry(entry: unknown): PlaceCandidate | null {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  const item = record.item && typeof record.item === 'object' ? (record.item as Record<string, unknown>) : undefined;

  const rawTitle = item?.name ?? record.name;
  if (!isValidPlaceTitle(rawTitle)) return null;

  const rawUrl = item?.url ?? record.url;
  return {
    title: cleanText(rawTitle),
    mapUrl: typeof rawUrl === 'string' && /google\.[^/]+\/maps|maps\.app\.goo\.gl/i.test(rawUrl) ? cleanText(rawUrl) : undefined,
  };
}

function extractJsonLdCandidates(html: string): PlaceCandidate[] {
  const candidates: PlaceCandidate[] = [];
  const scriptPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptPattern)) {
    const content = decodeHtmlEntities(match[1] || '').trim();
    if (!content) continue;

    try {
      const parsed = JSON.parse(content);
      const itemLists: Record<string, unknown>[] = [];
      collectItemLists(parsed, itemLists);

      for (const list of itemLists) {
        const elements = list.itemListElement;
        const entries = Array.isArray(elements) ? elements : elements ? [elements] : [];
        for (const entry of entries) {
          const candidate = getCandidateFromListEntry(entry);
          if (candidate) candidates.push(candidate);
        }
      }
    } catch {
      // Google may include unrelated or malformed JSON-LD blocks. Ignore those blocks only.
    }
  }

  return candidates;
}

function extractMapUrlCandidates(html: string): PlaceCandidate[] {
  const decoded = html
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
  const candidates: PlaceCandidate[] = [];
  const urlPatterns = [
    /https?:\/\/(?:www\.)?google\.[^/]+\/maps\/place\/([^/?#"'\\]+)[^"'\\\s<]*/g,
    /\/maps\/place\/([^/?#"'\\]+)[^"'\\\s<]*/g,
  ];

  for (const pattern of urlPatterns) {
    for (const match of decoded.matchAll(pattern)) {
      let title = '';
      try {
        title = cleanText(decodeURIComponent(match[1] || ''));
      } catch {
        title = cleanText(match[1] || '');
      }
      if (!isValidPlaceTitle(title)) continue;
      const rawUrl = match[0].startsWith('http') ? match[0] : `https://www.google.com${match[0]}`;
      candidates.push({ title, mapUrl: rawUrl });
    }
  }

  return candidates;
}

function extractPlaceCandidates(html: string) {
  const jsonLdCandidates = extractJsonLdCandidates(html);
  const fallbackCandidates = jsonLdCandidates.length ? [] : extractMapUrlCandidates(html);
  return unique([...jsonLdCandidates, ...fallbackCandidates], item => item.title).slice(0, 150);
}

async function enrichPlace(title: string, fallbackUrl?: string): Promise<PlaceResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { id: title, title, mapUrl: fallbackUrl };

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.regularOpeningHours,places.googleMapsUri',
      },
      body: JSON.stringify({ textQuery: title, languageCode: 'ko', maxResultCount: 1 }),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Places lookup failed');
    const data = await response.json();
    const place = data.places?.[0];
    if (!place) return { id: title, title, mapUrl: fallbackUrl };
    return {
      id: place.id || title,
      title: place.displayName?.text || title,
      address: place.formattedAddress,
      location: place.location ? { lat: place.location.latitude, lng: place.location.longitude } : undefined,
      openingHours: place.regularOpeningHours?.weekdayDescriptions,
      mapUrl: place.googleMapsUri || fallbackUrl,
    };
  } catch {
    return { id: title, title, mapUrl: fallbackUrl };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = String(body.url || '').trim();
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return NextResponse.json({ error: '올바른 Google Maps 링크가 아니에요.' }, { status: 400 });
    }
    if (!/(^|\.)google\.[^/]+$|(^|\.)goo\.gl$/.test(url.hostname) && url.hostname !== 'maps.app.goo.gl') {
      return NextResponse.json({ error: 'Google Maps 공유 링크만 사용할 수 있어요.' }, { status: 400 });
    }

    const response = await fetch(url.toString(), {
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'Google Maps 목록 페이지를 열지 못했어요.' }, { status: 502 });
    }

    const html = await response.text();
    const candidates = extractPlaceCandidates(html);
    if (!candidates.length) {
      return NextResponse.json(
        { error: '공개된 장소를 찾지 못했어요. Google Maps에서 목록을 공유 가능 상태로 바꾼 뒤 다시 시도해 주세요.' },
        { status: 422 },
      );
    }

    const places: PlaceResult[] = [];
    for (let index = 0; index < candidates.length; index += 5) {
      const batch = candidates.slice(index, index + 5);
      const results = await Promise.all(batch.map(item => enrichPlace(item.title, item.mapUrl)));
      places.push(...results);
    }

    return NextResponse.json({ places: unique(places, place => place.id || place.title), sourceUrl: response.url });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: '저장목록을 가져오는 중 오류가 발생했어요.' }, { status: 500 });
  }
}
