import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q');
  if (!query) return NextResponse.json({ error: '검색어가 필요합니다.' }, { status: 400 });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ demo: true, places: [] });

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.regularOpeningHours,places.googleMapsUri,places.primaryType,places.primaryTypeDisplayName,places.rating,places.photos',
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'ko' }),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) return NextResponse.json({ error: data?.error?.message ?? '장소 검색에 실패했습니다.' }, { status: response.status });
  return NextResponse.json({ places: data.places ?? [] });
}
