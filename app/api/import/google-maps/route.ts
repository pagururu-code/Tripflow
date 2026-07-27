import { NextRequest, NextResponse } from 'next/server';

type PlaceResult = {
  id: string;
  title: string;
  address?: string;
  location?: { lat: number; lng: number };
  openingHours?: string[];
  mapUrl?: string;
};

type Candidate = { title: string; mapUrl?: string };

const cleanText = (value: string) =>
  value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\u0027/g, "'")
    .replace(/\\u0022/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const unique = <T,>(items: T[], key: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter(item => {
    const value = key(item).normalize('NFKC').toLocaleLowerCase();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

const isValidPlaceName = (raw: string) => {
  const title = cleanText(raw);
  if (title.length < 2 || title.length > 120) return false;
  if (/^별표\s*평점\s*[:：]?\s*\d(?:\.\d)?\s*\/\s*5$/i.test(title)) return false;
  if (/^리뷰\s*[\d,.]+\s*개?$/i.test(title)) return false;
  if (/^\d(?:\.\d)?\s*\/\s*5$/i.test(title)) return false;
  if (/^(주소\s*정보\s*없음|이미\s*있음|저장됨|저장|공유|길찾기|전화|웹사이트|메뉴|사진|리뷰|개요)$/i.test(title)) return false;
  if (/^(google|google maps|maps|지도|목록|저장목록|검색|로그인|계정|닫기|열기|더보기)$/i.test(title)) return false;
  if (/^[\d\s.,:+\-–—_/()\[\]{}★☆⭐·•]+$/.test(title)) return false;
  if (/^(영업\s*중|영업\s*종료|휴무|곧\s*영업\s*종료|영업시간)/i.test(title)) return false;
  if (/^(₩|\$|€|¥)+$/.test(title)) return false;
  if (/^https?:\/\//i.test(title)) return false;
  return true;
};

const walkJson = (value: unknown, visit: (node: Record<string, unknown>) => void) => {
  if (Array.isArray(value)) {
    value.forEach(item => walkJson(item, visit));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const node = value as Record<string, unknown>;
  visit(node);
  Object.values(node).forEach(child => walkJson(child, visit));
};

function extractFromJsonLd(html: string): Candidate[] {
  const candidates: Candidate[] = [];
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1]);
      walkJson(parsed, node => {
        const rawType = node['@type'];
        const types = Array.isArray(rawType) ? rawType : [rawType];
        if (!types.includes('ItemList')) return;
        const elements = node.itemListElement;
        if (!Array.isArray(elements)) return;
        for (const element of elements) {
          if (!element || typeof element !== 'object') continue;
          const entry = element as Record<string, unknown>;
          const item = entry.item && typeof entry.item === 'object' ? (entry.item as Record<string, unknown>) : undefined;
          const name = typeof item?.name === 'string' ? item.name : typeof entry.name === 'string' ? entry.name : '';
          const mapUrl = typeof item?.url === 'string' ? item.url : typeof entry.url === 'string' ? entry.url : undefined;
          if (isValidPlaceName(name)) candidates.push({ title: cleanText(name), mapUrl });
        }
      });
    } catch {
      // Continue with other extraction paths.
    }
  }
  return candidates;
}

function extractFromPlaceUrls(decoded: string): Candidate[] {
  const candidates: Candidate[] = [];
  const patterns = [
    /https?:\/\/(?:www\.)?google\.[^/]+\/maps\/place\/([^/?#"'\\]+)[^"'\\\s]*/g,
    /\/maps\/place\/([^/?#"'\\]+)[^"'\\\s]*/g,
    /https?:\/\/(?:www\.)?google\.[^/]+\/maps\/search\/\?api=1&query=([^&"'\\]+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern)) {
      let title = '';
      try {
        title = cleanText(decodeURIComponent(match[1] || ''));
      } catch {
        title = cleanText(match[1] || '');
      }
      if (!isValidPlaceName(title)) continue;
      const rawUrl = match[0].startsWith('http') ? match[0] : `https://www.google.com${match[0]}`;
      candidates.push({ title, mapUrl: rawUrl });
    }
  }
  return candidates;
}

function extractFromEmbeddedNames(decoded: string): Candidate[] {
  const candidates: Candidate[] = [];
  const patterns = [
    /"name"\s*:\s*"((?:\\.|[^"\\]){2,160})"/g,
    /"title"\s*:\s*"((?:\\.|[^"\\]){2,160})"/g,
  ];
  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern)) {
      const title = cleanText(match[1]);
      if (isValidPlaceName(title)) candidates.push({ title });
    }
  }
  return candidates;
}

function extractFromGoogleBootstrap(html: string): Candidate[] {
  const candidates: Candidate[] = [];
  const scriptBodies = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scriptBodies) {
    const body = match[1] || '';
    if (!/(AF_initDataCallback|APP_INITIALIZATION_STATE|_pageData|google\.maps)/.test(body)) continue;
    for (const stringMatch of body.matchAll(/"((?:\\.|[^"\\]){2,120})"/g)) {
      const title = cleanText(stringMatch[1]);
      if (!isValidPlaceName(title)) continue;
      if (!/[A-Za-z\u3131-\uD79D\u3040-\u30ff\u3400-\u9fff]/.test(title)) continue;
      if ((title.match(/\s+/g)?.length || 0) > 8) continue;
      if (/[.!?。！？]$/.test(title)) continue;
      if (/^(google maps|google|maps|지도|저장목록|공유 목록|목록 공유|장소 저장|로그인|검색 결과)/i.test(title)) continue;
      candidates.push({ title });
    }
  }
  return candidates;
}

function extractPlaceCandidates(html: string) {
  const decoded = cleanText(html);
  const structured = [
    ...extractFromJsonLd(html),
    ...extractFromPlaceUrls(decoded),
    ...extractFromEmbeddedNames(decoded),
  ];
  const candidates = structured.length ? structured : extractFromGoogleBootstrap(html);
  return unique(candidates, item => item.title).slice(0, 40);
}

async function enrichPlace(title: string, fallbackUrl?: string): Promise<PlaceResult | null> {
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
    if (!response.ok) return null;
    const data = await response.json();
    const place = data.places?.[0];
    if (!place) return null;
    return {
      id: place.id || title,
      title: place.displayName?.text || title,
      address: place.formattedAddress,
      location: place.location ? { lat: place.location.latitude, lng: place.location.longitude } : undefined,
      openingHours: place.regularOpeningHours?.weekdayDescriptions,
      mapUrl: place.googleMapsUri || fallbackUrl,
    };
  } catch {
    return null;
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
        { error: '목록 페이지는 열었지만 장소명을 읽지 못했어요. 잠시 후 다시 시도해 주세요.' },
        { status: 422 },
      );
    }

    const places: PlaceResult[] = [];
    for (let index = 0; index < candidates.length; index += 5) {
      const batch = candidates.slice(index, index + 5);
      const results = await Promise.all(batch.map(item => enrichPlace(item.title, item.mapUrl)));
      places.push(...results.filter((place): place is PlaceResult => Boolean(place)));
    }

    const verifiedPlaces = unique(places, place => place.id || place.title);
    if (!verifiedPlaces.length) {
      return NextResponse.json(
        { error: '장소 후보는 찾았지만 Google Places에서 실제 장소로 확인하지 못했어요.' },
        { status: 422 },
      );
    }

    return NextResponse.json({ places: verifiedPlaces, sourceUrl: response.url });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: '저장목록을 가져오는 중 오류가 발생했어요.' }, { status: 500 });
  }
}
