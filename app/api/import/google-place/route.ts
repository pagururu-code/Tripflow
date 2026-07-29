import { NextRequest, NextResponse } from 'next/server';

const TYPE_LABELS: Record<string, string> = {
  restaurant: '음식점', cafe: '카페', coffee_shop: '카페', bakery: '베이커리',
  bar: '바', pub: '펍', japanese_restaurant: '일식당', korean_restaurant: '한식당',
  chinese_restaurant: '중식당', ramen_restaurant: '라멘집', sushi_restaurant: '스시·초밥집',
  curry_restaurant: '카레 전문점', seafood_restaurant: '해산물 식당', dessert_shop: '디저트 가게',
  ice_cream_shop: '아이스크림 가게', shopping_mall: '쇼핑몰', department_store: '백화점',
  store: '상점', clothing_store: '의류 매장', souvenir_store: '기념품점', market: '시장',
  museum: '박물관', art_gallery: '미술관', tourist_attraction: '관광명소', park: '공원',
  garden: '정원', observation_deck: '전망대', shrine: '신사', temple: '사찰', church: '교회',
  spa: '스파', hot_spring: '온천', hotel: '호텔', lodging: '숙소', train_station: '기차역',
  transit_station: '교통시설', airport: '공항', tourist_information_center: '관광안내소',
};

function typeLabel(primaryType?: string) {
  if (!primaryType) return undefined;
  return TYPE_LABELS[primaryType] || primaryType
    .split('_')
    .filter(Boolean)
    .map(word => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

function isGoogleMapsHost(hostname: string) {
  return /(^|\.)google\.[^/]+$|(^|\.)goo\.gl$/.test(hostname) || hostname === 'maps.app.goo.gl';
}

function cleanQuery(value = '') {
  return value
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPlaceQuery(url: URL) {
  const direct = url.searchParams.get('q') || url.searchParams.get('query');
  if (direct) return cleanQuery(direct);

  const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/i);
  if (placeMatch?.[1]) {
    try { return cleanQuery(decodeURIComponent(placeMatch[1])); }
    catch { return cleanQuery(placeMatch[1]); }
  }

  const searchMatch = url.pathname.match(/\/maps\/search\/([^/]+)/i);
  if (searchMatch?.[1]) {
    try { return cleanQuery(decodeURIComponent(searchMatch[1])); }
    catch { return cleanQuery(searchMatch[1]); }
  }

  return '';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = String(body.url || '').trim();
    const city = String(body.city || '').trim();

    let inputUrl: URL;
    try { inputUrl = new URL(input); }
    catch { return NextResponse.json({ error: '올바른 Google 지도 링크가 아니에요.' }, { status: 400 }); }

    if (!isGoogleMapsHost(inputUrl.hostname)) {
      return NextResponse.json({ error: 'Google 지도 장소 링크만 사용할 수 있어요.' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Vercel에 GOOGLE_MAPS_API_KEY가 설정되지 않았어요.' }, { status: 500 });
    }

    const resolved = await fetch(inputUrl.toString(), {
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });

    if (!resolved.ok) {
      return NextResponse.json({ error: 'Google 지도 링크를 열지 못했어요.' }, { status: 502 });
    }

    const finalUrl = new URL(resolved.url);
    const placeQuery = extractPlaceQuery(finalUrl) || extractPlaceQuery(inputUrl);
    if (!placeQuery) {
      return NextResponse.json({ error: '이 링크에서 장소명을 확인하지 못했어요. Google 지도에서 장소 하나를 연 뒤 공유 링크를 복사해 주세요.' }, { status: 422 });
    }

    const textQuery = [placeQuery, city].filter(Boolean).join(' ');
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.shortFormattedAddress',
          'places.location',
          'places.regularOpeningHours',
          'places.googleMapsUri',
          'places.primaryType',
          'places.types',
        ].join(','),
      },
      body: JSON.stringify({ textQuery, languageCode: 'ko', maxResultCount: 1 }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: data?.error?.message || '장소 정보를 가져오지 못했어요.' }, { status: response.status });
    }

    const place = data.places?.[0];
    const title = place?.displayName?.text;
    if (!place || !title) {
      return NextResponse.json({ error: '이 링크에 해당하는 장소를 찾지 못했어요.' }, { status: 422 });
    }

    const primaryType = place.primaryType || place.types?.[0];
    return NextResponse.json({
      place: {
        id: place.id || crypto.randomUUID(),
        title,
        address: place.formattedAddress || place.shortFormattedAddress,
        location: place.location ? { lat: place.location.latitude, lng: place.location.longitude } : undefined,
        openingHours: place.regularOpeningHours?.weekdayDescriptions,
        placeType: typeLabel(primaryType),
        mapUrl: place.googleMapsUri || finalUrl.toString(),
        verified: true,
      },
      sourceUrl: finalUrl.toString(),
    });
  } catch (error) {
    console.error('Single Google place import failed', error);
    return NextResponse.json({ error: '장소 링크를 가져오는 중 오류가 발생했어요.' }, { status: 500 });
  }
}
