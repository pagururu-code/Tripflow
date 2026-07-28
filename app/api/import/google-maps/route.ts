import { NextRequest, NextResponse } from 'next/server';

type Candidate = { title: string; mapUrl?: string };
type PlaceResult = {
  id: string;
  title: string;
  address?: string;
  location?: { lat: number; lng: number };
  openingHours?: string[];
  placeType?: string;
  mapUrl?: string;
};

const TYPE_LABELS: Record<string, string> = {
  restaurant: '음식점',
  cafe: '카페',
  coffee_shop: '카페',
  bakery: '베이커리',
  bar: '바',
  pub: '펍',
  japanese_restaurant: '일식당',
  korean_restaurant: '한식당',
  chinese_restaurant: '중식당',
  ramen_restaurant: '라멘집',
  sushi_restaurant: '스시·초밥집',
  curry_restaurant: '카레 전문점',
  seafood_restaurant: '해산물 식당',
  dessert_shop: '디저트 가게',
  ice_cream_shop: '아이스크림 가게',
  shopping_mall: '쇼핑몰',
  department_store: '백화점',
  store: '상점',
  clothing_store: '의류 매장',
  souvenir_store: '기념품점',
  market: '시장',
  museum: '박물관',
  art_gallery: '미술관',
  tourist_attraction: '관광명소',
  park: '공원',
  garden: '정원',
  observation_deck: '전망대',
  shrine: '신사',
  temple: '사찰',
  church: '교회',
  spa: '스파',
  hot_spring: '온천',
  hotel: '호텔',
  lodging: '숙소',
  train_station: '기차역',
  transit_station: '교통시설',
  airport: '공항',
};

function cleanText(value = '') {
  return value
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
}

function normalize(value = '') {
  return cleanText(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function isValidTitle(value: string) {
  const title = cleanText(value);
  const normalized = normalize(title);
  if (title.length < 2 || title.length > 120 || normalized.length < 2) return false;
  if (/^(google|google maps|maps|지도|목록|저장목록|검색|로그인|계정|닫기|열기|더보기)$/i.test(title)) return false;
  if (/^(주소|저장|공유|길찾기|전화|웹사이트|메뉴|사진|리뷰|개요|영업시간)$/i.test(title)) return false;
  if (/^(영업 중|영업 종료|휴무|곧 영업 종료)/i.test(title)) return false;
  if (/^https?:\/\//i.test(title)) return false;
  if (/^[\d\s.,:+\-–—_/()\[\]{}★☆⭐·•]+$/.test(title)) return false;
  return true;
}

function uniqueCandidates(items: Candidate[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = normalize(item.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractCandidates(html: string) {
  const candidates: Candidate[] = [];

  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1]);
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== 'object') return;
        const record = node as Record<string, unknown>;
        const name = typeof record.name === 'string' ? record.name : '';
        const url = typeof record.url === 'string' ? record.url : undefined;
        if (name && isValidTitle(name)) candidates.push({ title: cleanText(name), mapUrl: url });
        Object.values(record).forEach(walk);
      };
      walk(value);
    } catch {
      // Continue with other extraction strategies.
    }
  }

  const decoded = cleanText(html);
  const urlPatterns = [
    /https?:\/\/(?:www\.)?google\.[^/]+\/maps\/place\/([^/?#"'\\]+)[^"'\\\s]*/g,
    /\/maps\/place\/([^/?#"'\\]+)[^"'\\\s]*/g,
  ];
  for (const pattern of urlPatterns) {
    for (const match of decoded.matchAll(pattern)) {
      let title = cleanText(match[1] || '');
      try { title = cleanText(decodeURIComponent(match[1] || '')); } catch {}
      if (!isValidTitle(title)) continue;
      const mapUrl = match[0].startsWith('http') ? match[0] : `https://www.google.com${match[0]}`;
      candidates.push({ title, mapUrl });
    }
  }

  for (const pattern of [/"name"\s*:\s*"((?:\\.|[^"\\]){2,160})"/g, /"title"\s*:\s*"((?:\\.|[^"\\]){2,160})"/g]) {
    for (const match of decoded.matchAll(pattern)) {
      const title = cleanText(match[1]);
      if (isValidTitle(title)) candidates.push({ title });
    }
  }

  if (!candidates.length) {
    for (const match of decoded.matchAll(/"((?:\\.|[^"\\]){2,120})"/g)) {
      const title = cleanText(match[1]);
      if (isValidTitle(title) && /[\u3131-\uD79D\u3040-\u30ff\u3400-\u9fffA-Za-z]/.test(title)) {
        candidates.push({ title });
      }
    }
  }

  return uniqueCandidates(candidates).slice(0, 40);
}

function typeLabel(primaryType?: string) {
  if (!primaryType) return undefined;
  return TYPE_LABELS[primaryType] || primaryType
    .split('_')
    .filter(Boolean)
    .map(word => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

async function searchPlace(candidate: Candidate, apiKey: string): Promise<PlaceResult | null> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      // Keep this to one request per place. primaryTypeDisplayName is intentionally
      // excluded because an unsupported field makes the entire Places request fail.
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.regularOpeningHours,places.googleMapsUri,places.primaryType',
    },
    body: JSON.stringify({
      textQuery: candidate.title,
      languageCode: 'ko',
      maxResultCount: 1,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Google Places search failed', response.status, detail);
    return null;
  }

  const data = await response.json();
  const place = data.places?.[0];
  const title = place?.displayName?.text;
  if (!place || !title) return null;

  return {
    id: place.id || normalize(title) || crypto.randomUUID(),
    title,
    address: place.formattedAddress,
    location: place.location
      ? { lat: place.location.latitude, lng: place.location.longitude }
      : undefined,
    openingHours: place.regularOpeningHours?.weekdayDescriptions,
    placeType: typeLabel(place.primaryType),
    mapUrl: place.googleMapsUri || candidate.mapUrl,
  };
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

    const allowed = /(^|\.)google\.[^/]+$|(^|\.)goo\.gl$/.test(url.hostname) || url.hostname === 'maps.app.goo.gl';
    if (!allowed) return NextResponse.json({ error: 'Google Maps 공유 링크만 사용할 수 있어요.' }, { status: 400 });

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Vercel에 GOOGLE_MAPS_API_KEY가 설정되지 않았어요.' }, { status: 500 });
    }

    const listResponse = await fetch(url.toString(), {
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });

    if (!listResponse.ok) {
      return NextResponse.json({ error: 'Google Maps 목록 페이지를 열지 못했어요.' }, { status: 502 });
    }

    const candidates = extractCandidates(await listResponse.text());
    if (!candidates.length) {
      return NextResponse.json({ error: '목록 페이지에서 장소명을 읽지 못했어요.' }, { status: 422 });
    }

    const results: PlaceResult[] = [];
    for (let index = 0; index < candidates.length; index += 5) {
      const batch = candidates.slice(index, index + 5);
      const places = await Promise.all(batch.map(candidate => searchPlace(candidate, apiKey)));
      results.push(...places.filter((place): place is PlaceResult => Boolean(place)));
    }

    const seen = new Set<string>();
    const places = results.filter(place => {
      const key = place.id || normalize(`${place.title}|${place.address || ''}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!places.length) {
      return NextResponse.json({ error: 'Google Places에서 장소 정보를 가져오지 못했어요. API 설정을 확인해 주세요.' }, { status: 422 });
    }

    return NextResponse.json({ places, sourceUrl: listResponse.url });
  } catch (error) {
    console.error('Google Maps import failed', error);
    return NextResponse.json({ error: '저장목록을 가져오는 중 오류가 발생했어요.' }, { status: 500 });
  }
}
