import { NextRequest, NextResponse } from 'next/server';

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
      'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryType,places.primaryTypeDisplayName',
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'ko',
      maxResultCount: 1,
    }),
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json(
      { error: data?.error?.message ?? '장소 타입 검색에 실패했습니다.' },
      { status: response.status },
    );
  }

  const place = data.places?.[0];
  if (!place) return NextResponse.json({ places: [] });

  return NextResponse.json({
    places: [{
      id: place.id,
      displayName: place.displayName,
      primaryType: place.primaryType,
      primaryTypeDisplayName: place.primaryTypeDisplayName,
    }],
  });
}
