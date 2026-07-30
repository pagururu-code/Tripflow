'use client';

import { useEffect } from 'react';
import type { AppData, InboxItem, Schedule } from '@/lib/types';

type PlaceLike = Pick<InboxItem,'title'|'placeType'|'openingHours'> & Partial<Pick<Schedule,'date'|'start'|'duration'>>;

const APP_KEY = 'tripflow-v2';
const DAY_NAMES = ['일','월','화','수','목','금','토'];

function readData():AppData|null {
  try { const raw = localStorage.getItem(APP_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function weekdayIndex(date?:string) {
  const value = date ? new Date(`${date}T12:00:00`) : new Date();
  const day = value.getDay();
  return day === 0 ? 6 : day - 1;
}

function todayDescription(item:PlaceLike) {
  const descriptions = item.openingHours || [];
  return descriptions[weekdayIndex(item.date)] || '';
}

function timePart(description:string) {
  const colon = description.indexOf(':');
  return colon >= 0 ? description.slice(colon + 1).trim() : description.trim();
}

function parseClock(token:string) {
  const normalized = token.replace(/\s+/g,' ').trim();
  const match = normalized.match(/(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})/i);
  if (!match) return null;
  let hour = Number(match[2]);
  const minute = Number(match[3]);
  const marker = (match[1] || '').toUpperCase();
  if ((marker === '오후' || marker === 'PM') && hour < 12) hour += 12;
  if ((marker === '오전' || marker === 'AM') && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function openingIntervals(description:string) {
  if (!description || /(휴무|영업하지 않음|closed)/i.test(description)) return [];
  if (/(24시간|24 hours|open 24)/i.test(description)) return [[0,1440]] as [number,number][];
  const tokens = [...description.matchAll(/(?:오전|오후|AM|PM)?\s*\d{1,2}:\d{2}/gi)]
    .map(match => parseClock(match[0]))
    .filter((value):value is number => value !== null);
  const intervals:[number,number][] = [];
  for (let i=0;i+1<tokens.length;i+=2) {
    let end = tokens[i+1];
    if (end < tokens[i]) end += 1440;
    intervals.push([tokens[i],end]);
  }
  return intervals;
}

function scheduleConflict(item:PlaceLike) {
  if (!item.date || !item.start || !item.openingHours?.length) return '';
  const description = todayDescription(item);
  if (!description) return '';
  if (/(휴무|영업하지 않음|closed)/i.test(description)) return '이 날짜는 휴무예요.';
  if (/(24시간|24 hours|open 24)/i.test(description)) return '';
  const start = parseClock(item.start);
  if (start === null) return '';
  const end = start + Number(item.duration || 0);
  const fits = openingIntervals(description).some(([open,close]) => start >= open && end <= close);
  return fits ? '' : `일정 시간이 영업시간과 맞지 않아요. (${timePart(description)})`;
}

function itemSignature(item:PlaceLike, schedule:boolean) {
  return JSON.stringify([item.title,item.placeType,item.openingHours,item.date,item.start,item.duration,schedule]);
}

function detailsMarkup(item:PlaceLike, schedule=false) {
  if (!item.placeType && !item.openingHours?.length) return null;
  const description = todayDescription(item);
  const warning = schedule ? scheduleConflict(item) : '';
  const wrap = document.createElement('div');
  wrap.className = 'tf-place-details';
  wrap.dataset.signature = itemSignature(item,schedule);
  if (item.placeType) {
    const type = document.createElement('p');
    type.textContent = `🏷️ ${item.placeType}`;
    wrap.appendChild(type);
  }
  if (description) {
    const today = document.createElement('p');
    today.className = warning ? 'tf-hours-warning' : '';
    const label = schedule && item.date ? `${DAY_NAMES[new Date(`${item.date}T12:00:00`).getDay()]}요일` : '오늘';
    today.textContent = warning ? `🔴 ${warning}` : `🕒 ${label} ${timePart(description)}`;
    wrap.appendChild(today);
  }
  if (item.openingHours?.length) {
    const details = document.createElement('details');
    details.className = 'tf-week-hours';
    const summary = document.createElement('summary');
    summary.textContent = '요일별 영업시간';
    details.appendChild(summary);
    const list = document.createElement('div');
    item.openingHours.forEach(line => {
      const row = document.createElement('p');
      row.textContent = line;
      list.appendChild(row);
    });
    details.appendChild(list);
    wrap.appendChild(details);
  }
  return wrap;
}

function installStyles() {
  if (document.getElementById('tf-place-hours-styles')) return;
  const style = document.createElement('style');
  style.id = 'tf-place-hours-styles';
  style.textContent = `.tf-place-details{margin-top:9px;padding-top:9px;border-top:1px solid #edf0ee}.tf-place-details p{margin:4px 0!important;font-size:12px!important;color:#59655f!important;display:block!important}.tf-place-details .tf-hours-warning{color:#c73535!important;font-weight:850}.tf-week-hours{margin-top:6px;font-size:12px;color:#647069}.tf-week-hours summary{cursor:pointer;font-weight:800;color:#536159;list-style:none}.tf-week-hours summary::-webkit-details-marker{display:none}.tf-week-hours summary:after{content:' ▾'}.tf-week-hours[open] summary:after{content:' ▴'}.tf-week-hours div{margin-top:7px;padding:8px 10px;background:#f6f8f6;border-radius:10px}.tf-week-hours div p{margin:3px 0!important}`;
  document.head.appendChild(style);
}

function syncDetails(card:HTMLElement,item:PlaceLike,schedule:boolean,target:HTMLElement) {
  const signature = itemSignature(item,schedule);
  const existing = card.querySelector<HTMLElement>('.tf-place-details');
  if (existing?.dataset.signature === signature) return;
  const wasOpen = Boolean(existing?.querySelector('details')?.hasAttribute('open'));
  existing?.remove();
  const details = detailsMarkup(item,schedule);
  if (!details) return;
  if (wasOpen) details.querySelector('details')?.setAttribute('open','');
  target.appendChild(details);
}

function enhance() {
  installStyles();
  const data = readData();
  if (!data) return;
  const trip = data.trips.find(item => item.id === data.activeTripId) || data.trips[0];
  if (!trip) return;
  const schedules = data.schedules.filter(item => item.tripId === trip.id);

  document.querySelectorAll<HTMLElement>('.schedule-card').forEach(card => {
    const title = card.querySelector('h3')?.textContent?.trim();
    const item = schedules.find(entry => entry.title === title && entry.openingHours?.length);
    if (item) syncDetails(card,item,true,card);
  });
}

export default function PlaceHoursEnhancer() {
  useEffect(() => {
    let queued = false;
    const run = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => { queued = false; enhance(); });
    };
    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body,{childList:true,subtree:true});
    const onStorage = (event:StorageEvent) => { if (event.key === APP_KEY) run(); };
    window.addEventListener('storage',onStorage);
    return () => { observer.disconnect(); window.removeEventListener('storage',onStorage); };
  },[]);
  return null;
}
