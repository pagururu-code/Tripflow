import { NextRequest, NextResponse } from 'next/server';

type PlaceResult = {
  id: string;
  title: string;
  address?: string;
  location?: { lat: number; lng: number };
  openingHours?: string[];
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

function extractPlaceCandidates(html: string) {
  const decoded = html
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
  const candidates: { title: string; mapUrl?: string }[] = [];

  const urlPatterns = [
    /https?:\/\/(?:www\.)?google\.[^/]+\/maps\/place\/([^/?#"'\\]+)[^"'\\\s]*/g,
    /\/maps\/place\/([^/?#"'\\]+)[^"'\\\s]*/g,
  ];
  for (const pattern of urlPatterns) {
    for (const match of decoded.matchAll(pattern)) {
      let title = cleanText(decodeURIComponent(match[1] || ''));
      if (!title || title.length > 160) continue;
      const rawUrl = match[0].startsWith('http') ? match[0] : `https://www.google.com${match[0]}`;
      candidates.push({ title, mapUrl: rawUrl });
    }
  }

  const namePatterns = [
    /"name"\s*:\s*"([^"\\]{2,120})"/g,
    /"title"\s*:\s*"([^"\\]{2,120})"/g,
    /aria-label="([^"]{2,120})"/g,
  ];
  for (const pattern of namePatterns) {
    for (const match of decoded.matchAll(pattern)) {
      const title = cleanText(match[1]);
      if (/google|지도|maps|목록|저장|공유|로그인|검색/i.test(title)) continue;
      candidates.push({ title });
    }
  }

  return unique(candidates, item => item.title).slice(0, 150);
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
      body: JSON.stringify({ textQuery: title, languageCode: 'ko' }),
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
