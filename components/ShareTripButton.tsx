'use client';

import { usePathname } from 'next/navigation';
import { Share2 } from 'lucide-react';
import type { AppData } from '@/lib/types';

type SharePayload = {
  version: 1;
  trip: AppData['trips'][number];
  schedules: AppData['schedules'];
  inbox: AppData['inbox'];
  dayTitles: Record<string, { icon: string; title: string }>;
};

const encodePayload = (payload: SharePayload) => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

export default function ShareTripButton() {
  const pathname = usePathname();
  if (pathname.startsWith('/share')) return null;

  const share = async () => {
    try {
      const raw = localStorage.getItem('tripflow-v2');
      if (!raw) {
        alert('공유할 여행 데이터가 아직 없어요.');
        return;
      }

      const data = JSON.parse(raw) as AppData;
      const trip = data.trips.find(item => item.id === data.activeTripId) || data.trips[0];
      if (!trip) {
        alert('공유할 여행을 찾지 못했어요.');
        return;
      }

      const dayTitlesRaw = localStorage.getItem('tripflow-day-titles-v1');
      const allDayTitles = dayTitlesRaw ? JSON.parse(dayTitlesRaw) as Record<string, { icon: string; title: string }> : {};
      const dayTitles = Object.fromEntries(Object.entries(allDayTitles).filter(([key]) => key.startsWith(`${trip.id}:`)));
      const payload: SharePayload = {
        version: 1,
        trip,
        schedules: data.schedules.filter(item => item.tripId === trip.id),
        inbox: data.inbox.filter(item => item.tripId === trip.id),
        dayTitles,
      };
      const url = `${window.location.origin}/share#${encodePayload(payload)}`;
      const text = `${trip.title} 여행 계획을 확인해 주세요.`;

      if (navigator.share) {
        await navigator.share({ title: trip.title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        alert('공유 링크를 복사했어요.');
      }
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      console.error(error);
      alert('공유 링크를 만드는 중 오류가 발생했어요.');
    }
  };

  return <button type="button" onClick={share} aria-label="여행 공유" style={{position:'fixed',right:18,bottom:86,zIndex:40,border:0,borderRadius:999,padding:'12px 16px',display:'flex',alignItems:'center',gap:8,background:'#17231d',color:'#fff',fontWeight:800,boxShadow:'0 10px 28px rgba(23,35,29,.25)'}}><Share2 size={18}/>공유</button>;
}
