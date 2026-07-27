'use client';

import { useEffect, useMemo, useState } from 'react';
import type { InboxItem, Schedule, Trip } from '@/lib/types';

type SharePayload = {
  version: 1;
  trip: Trip;
  schedules: Schedule[];
  inbox: InboxItem[];
  dayTitles: Record<string, { icon: string; title: string }>;
};

const decodePayload = (value: string) => {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
};

const duration = (minutes: number) => `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}시간 ` : ''}${minutes % 60 ? `${minutes % 60}분` : ''}`.trim();

export default function SharedTripPage() {
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const encoded = window.location.hash.slice(1);
      if (!encoded) throw new Error('missing');
      const decoded = decodePayload(encoded);
      if (!decoded.trip || decoded.version !== 1) throw new Error('invalid');
      setPayload(decoded);
    } catch {
      setError('공유 링크가 올바르지 않거나 일부가 잘렸어요.');
    }
  }, []);

  const dates = useMemo(() => {
    if (!payload) return [];
    return [...new Set(payload.schedules.map(item => item.date))].sort();
  }, [payload]);

  const copySummary = async () => {
    if (!payload) return;
    const lines = [
      `여행: ${payload.trip.title}`,
      `기간: ${payload.trip.startDate} ~ ${payload.trip.endDate}`,
      `도시: ${payload.trip.city}`,
      '',
      ...dates.flatMap(date => {
        const title = payload.dayTitles[`${payload.trip.id}:${date}`];
        const items = payload.schedules.filter(item => item.date === date).sort((a,b) => a.start.localeCompare(b.start));
        return [`[${date}]${title?.title ? ` ${title.icon || ''} ${title.title}` : ''}`, ...items.map(item => `- ${item.start} ${item.title}${item.address ? ` / ${item.address}` : ''} / ${duration(item.duration)}`), ''];
      }),
      payload.inbox.length ? '[Inbox 후보]' : '',
      ...payload.inbox.map(item => `- ${item.title}${item.address ? ` / ${item.address}` : ''} / ${duration(item.duration)} / 우선순위 ${item.priority}`),
    ].filter(Boolean);
    await navigator.clipboard.writeText(lines.join('\n'));
    alert('상담용 여행 요약을 복사했어요. ChatGPT에 붙여넣으면 돼요.');
  };

  if (error) return <main style={{maxWidth:720,margin:'0 auto',padding:'64px 20px'}}><h1>공유 여행</h1><p>{error}</p></main>;
  if (!payload) return <main style={{maxWidth:720,margin:'0 auto',padding:'64px 20px'}}><p>여행 계획을 불러오는 중…</p></main>;

  return <main style={{maxWidth:720,margin:'0 auto',padding:'28px 18px 80px'}}>
    <section style={{background:'#17231d',color:'#fff',borderRadius:24,padding:24,marginBottom:18}}>
      <small style={{opacity:.7,fontWeight:800,letterSpacing:1}}>TRIPFLOW · 읽기 전용</small>
      <h1 style={{margin:'10px 0 8px',fontSize:30}}>{payload.trip.title}</h1>
      <p style={{margin:0,opacity:.86}}>{payload.trip.startDate.replaceAll('-','.')} ― {payload.trip.endDate.replaceAll('-','.')} · {payload.trip.city}</p>
    </section>

    <button onClick={copySummary} style={{width:'100%',border:0,borderRadius:16,padding:'14px 16px',fontWeight:800,background:'#e7efe9',color:'#17231d',marginBottom:22}}>ChatGPT 상담용 요약 복사</button>

    {dates.map(date => {
      const title = payload.dayTitles[`${payload.trip.id}:${date}`];
      const items = payload.schedules.filter(item => item.date === date).sort((a,b) => a.start.localeCompare(b.start));
      return <section key={date} style={{marginBottom:28}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:12,marginBottom:10}}>
          <div><small style={{color:'#68736d'}}>{date}</small><h2 style={{margin:'4px 0 0'}}>{title?.title ? `${title.icon || ''} ${title.title}` : '일정'}</h2></div>
          <small>{items.length}개</small>
        </div>
        <div style={{display:'grid',gap:10}}>{items.map(item => <article key={item.id} style={{background:'#fff',border:'1px solid #e4e8e5',borderRadius:18,padding:16,boxShadow:'0 5px 18px rgba(23,35,29,.05)'}}>
          <div style={{display:'flex',gap:14}}><b style={{minWidth:46}}>{item.start}</b><div><h3 style={{margin:'0 0 6px'}}>{item.title}</h3>{item.address && <p style={{margin:'0 0 5px',color:'#56615b'}}>{item.address}</p>}<small>{duration(item.duration)}{item.note ? ` · ${item.note}` : ''}</small>{item.openingHours?.[0] && <p style={{margin:'7px 0 0',fontSize:12,color:'#68736d'}}>{item.openingHours[0]}</p>}</div></div>
        </article>)}</div>
      </section>;
    })}

    <section>
      <h2>Inbox 후보</h2>
      <p style={{color:'#68736d'}}>아직 날짜가 정해지지 않은 장소예요.</p>
      <div style={{display:'grid',gap:10}}>{payload.inbox.map(item => <article key={item.id} style={{background:'#fff',border:'1px solid #e4e8e5',borderRadius:18,padding:16}}><div style={{display:'flex',justifyContent:'space-between',gap:12}}><div><h3 style={{margin:'0 0 6px'}}>{item.title}</h3><p style={{margin:0,color:'#56615b'}}>{item.address || '장소 미정'} · {duration(item.duration)}</p>{item.note && <small>{item.note}</small>}</div><span>{'★'.repeat(item.priority)}</span></div></article>)}{!payload.inbox.length && <p>공유된 Inbox 후보가 없어요.</p>}</div>
    </section>
  </main>;
}
