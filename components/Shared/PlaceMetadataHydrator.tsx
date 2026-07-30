'use client';

import { useEffect } from 'react';
import type { AppData } from '@/lib/types';

const APP_KEY = 'tripflow-v2';

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

function label(value: string) {
  return TYPE_LABELS[value] || value.split('_').filter(Boolean).map(word => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

function extractType(mapUrl?: string) {
  if (!mapUrl) return '';
  try { return new URL(mapUrl).searchParams.get('tf_type') || ''; }
  catch { return ''; }
}

export default function PlaceMetadataHydrator() {
  useEffect(() => {
    let lastRaw = '';
    const sync = () => {
      const raw = localStorage.getItem(APP_KEY) || '';
      if (!raw || raw === lastRaw) return;
      lastRaw = raw;
      try {
        const data = JSON.parse(raw) as AppData;
        let changed = false;
        const hydrate = <T extends { mapUrl?: string; placeType?: string }>(item: T) => {
          if (item.placeType) return item;
          const primaryType = extractType(item.mapUrl);
          if (!primaryType) return item;
          changed = true;
          return { ...item, placeType: label(primaryType) };
        };
        const next = {
          ...data,
          inbox: data.inbox.map(hydrate),
          schedules: data.schedules.map(hydrate),
        };
        if (changed) {
          const nextRaw = JSON.stringify(next);
          lastRaw = nextRaw;
          localStorage.setItem(APP_KEY, nextRaw);
          window.dispatchEvent(new StorageEvent('storage', { key: APP_KEY, newValue: nextRaw }));
        }
      } catch {}
    };
    sync();
    const timer = window.setInterval(sync, 500);
    const onStorage = (event: StorageEvent) => { if (event.key === APP_KEY) sync(); };
    window.addEventListener('storage', onStorage);
    return () => { window.clearInterval(timer); window.removeEventListener('storage', onStorage); };
  }, []);
  return null;
}
