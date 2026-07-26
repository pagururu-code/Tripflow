import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const flight = req.nextUrl.searchParams.get('flight')?.replace(/\s/g, '').toUpperCase();
  const date = req.nextUrl.searchParams.get('date');
  if (!flight || !date) return NextResponse.json({ error: '편명과 날짜가 필요합니다.' }, { status: 400 });
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return NextResponse.json({ demo: true, flight: null });

  const url = new URL('https://api.aviationstack.com/v1/flights');
  url.searchParams.set('access_key', key);
  url.searchParams.set('flight_iata', flight);
  url.searchParams.set('flight_date', date);
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) return NextResponse.json({ error: data?.error?.message ?? '항공편을 조회하지 못했습니다.' }, { status: response.status });
  return NextResponse.json({ flight: data.data?.[0] ?? null });
}
