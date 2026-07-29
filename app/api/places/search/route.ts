import { NextRequest, NextResponse } from 'next/server';

function withTripflowType(mapUrl: string | undefined, primaryType: string | undefined) {
  if (!mapUrl || !primaryType) return mapUrl;
  try {
    const url = new URL(mapUrl);
    url.searchParams.set('tf_type', primaryType);
    return url.toString();
  } catch {
    return mapUrl;
  }
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim();
  if (!query) return NextResponse.json({ error: '검색어가 필요합니다.' }, { status: 400 });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: 'Google Maps API 키가 설정되지 않았습니다.' }, { status: 503 });

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
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
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'ko',
      maxResultCount: 5,
    }),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json(
      { error: data?.error?.message ?? '장소 검색에 실패했습니다.' },
      { status: response.status },
    );
  }

  const places = (data.places ?? []).map((place: any) => {
    const primaryType = place.primaryType || place.types?.[0];
    return {
      ...place,
      formattedAddress: place.formattedAddress || place.shortFormattedAddress,
      primaryType,
      googleMapsUri: withTripflowType(place.googleMapsUri, primaryType),
    };
  });

  return NextResponse.json({ places });
}
