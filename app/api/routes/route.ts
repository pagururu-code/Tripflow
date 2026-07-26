import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const body = await req.json();
  if (!key) return NextResponse.json({ demo: true, durationMinutes: 20, distanceMeters: 3200 });

  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { location: { latLng: body.origin } },
      destination: { location: { latLng: body.destination } },
      travelMode: body.travelMode ?? 'TRANSIT',
      languageCode: 'ko-KR',
      units: 'METRIC',
    }),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok || !data.routes?.[0]) return NextResponse.json({ error: data?.error?.message ?? '이동시간을 계산하지 못했습니다.' }, { status: response.status || 500 });
  const seconds = Number(String(data.routes[0].duration).replace('s', ''));
  return NextResponse.json({ durationMinutes: Math.ceil(seconds / 60), distanceMeters: data.routes[0].distanceMeters });
}
