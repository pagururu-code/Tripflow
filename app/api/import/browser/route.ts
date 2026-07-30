import { NextRequest, NextResponse } from 'next/server';

type BrowserPlace = { title?: unknown; mapUrl?: unknown; placeId?: unknown; address?: unknown };
type InputPlace = { title: string; mapUrl: string; placeId?: string; address?: string };

const TYPE_LABELS: Record<string, string> = {
  restaurant: '음식점', cafe: '카페', coffee_shop: '카페', bakery: '베이커리', bar: '바',
  japanese_restaurant: '일식당', korean_restaurant: '한식당', chinese_restaurant: '중식당',
  ramen_restaurant: '라멘집', sushi_restaurant: '스시·초밥집', shopping_mall: '쇼핑몰',
  department_store: '백화점', store: '상점', market: '시장', museum: '박물관',
  art_gallery: '미술관', tourist_attraction: '관광명소', park: '공원', garden: '정원',
  observation_deck: '전망대', shrine: '신사', temple: '사찰', spa: '스파',
  hot_spring: '온천', hotel: '호텔', lodging: '숙소', train_station: '기차역',
  transit_station: '교통시설', airport: '공항',
};

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});
const normalize = (value = '') => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const typeLabel = (value?: string) => value ? TYPE_LABELS[value] || value.split('_').join(' ') : undefined;

function validMapUrl(value: string) {
  try { const url = new URL(value); return /(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.pathname.includes('/maps/'); }
  catch { return false; }
}

async function enrich(input: InputPlace, apiKey: string) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.regularOpeningHours,places.googleMapsUri,places.primaryType,places.types',
    },
    body: JSON.stringify({ textQuery: input.title, languageCode: 'ko', maxResultCount: 1 }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Places API ${response.status}`);
  const result = await response.json();
  const place = result.places?.[0];
  if (!place?.displayName?.text) throw new Error('검색 결과 없음');
  return {
    id: place.id, title: place.displayName.text, address: place.formattedAddress || input.address,
    location: place.location ? { lat: place.location.latitude, lng: place.location.longitude } : undefined,
    openingHours: place.regularOpeningHours?.weekdayDescriptions,
    placeType: typeLabel(place.primaryType || place.types?.[0]),
    mapUrl: place.googleMapsUri || input.mapUrl, source: 'google-maps' as const,
  };
}

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: corsHeaders() }); }

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY가 설정되지 않았어요.' }, { status: 500, headers: corsHeaders() });
    const body = await request.json();
    if (!Array.isArray(body.places) || body.places.length === 0 || body.places.length > 300) {
      return NextResponse.json({ error: '장소는 1~300개까지 가져올 수 있어요.' }, { status: 400, headers: corsHeaders() });
    }
    const seen = new Set<string>();
    let duplicates = 0;
    const inputs = (body.places as BrowserPlace[]).flatMap(raw => {
      const title = String(raw.title || '').trim(), mapUrl = String(raw.mapUrl || '').trim();
      if (!title || title.length > 200 || !validMapUrl(mapUrl)) return [];
      const key = String(raw.placeId || '') || `${normalize(title)}|${mapUrl}`;
      if (seen.has(key)) { duplicates += 1; return []; }
      seen.add(key);
      return [{ title, mapUrl, placeId: String(raw.placeId || '') || undefined, address: String(raw.address || '') || undefined }];
    });
    const places: Array<Awaited<ReturnType<typeof enrich>>> = [];
    const failures: Array<{ title: string; error: string }> = [];
    for (let offset = 0; offset < inputs.length; offset += 5) {
      const batch = await Promise.allSettled(inputs.slice(offset, offset + 5).map(input => enrich(input, apiKey)));
      batch.forEach((result, index) => result.status === 'fulfilled'
        ? places.push(result.value)
        : failures.push({ title: inputs[offset + index].title, error: result.reason instanceof Error ? result.reason.message : '보강 실패' }));
    }
    return NextResponse.json({ places, received: body.places.length, duplicates, failed: failures.length, failures }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Browser import failed', error);
    return NextResponse.json({ error: '브라우저 가져오기 요청을 처리하지 못했어요.' }, { status: 500, headers: corsHeaders() });
  }
}
