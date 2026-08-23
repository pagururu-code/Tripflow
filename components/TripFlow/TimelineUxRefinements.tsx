'use client';

import { useEffect } from 'react';

function moveSummaryBelowTimeline() {
  const timeline = document.querySelector<HTMLElement>('main > .timeline');
  const summary = document.querySelector<HTMLElement>('main > .summary');
  if (!timeline || !summary || timeline.nextElementSibling === summary) return;
  timeline.after(summary);
}

function readTripData() {
  try { return JSON.parse(localStorage.getItem('tripflow-v2') || 'null'); } catch { return null; }
}

function addTripEditor(tripsModal: HTMLElement) {
  if (tripsModal.querySelector('[data-tripflow-trip-editor]')) return;
  const data = readTripData();
  const trip = data?.trips?.find((item: any) => item.id === data.activeTripId) || data?.trips?.[0];
  if (!trip) return;

  const editor = document.createElement('section');
  editor.setAttribute('data-tripflow-trip-editor', '');
  editor.className = 'trip-menu-editor';
  editor.innerHTML = `<h3>현재 여행 수정</h3><label>여행 제목<input data-trip-title value=""></label><div class="two"><label>시작일<input data-trip-start type="date" value=""></label><label>종료일<input data-trip-end type="date" value=""></label></div><button type="button" class="primary full" data-trip-save>변경사항 저장</button>`;
  const title = editor.querySelector<HTMLInputElement>('[data-trip-title]')!;
  const start = editor.querySelector<HTMLInputElement>('[data-trip-start]')!;
  const end = editor.querySelector<HTMLInputElement>('[data-trip-end]')!;
  title.value = trip.title || '';
  start.value = trip.startDate || '';
  end.value = trip.endDate || '';
  editor.querySelector<HTMLButtonElement>('[data-trip-save]')?.addEventListener('click', () => {
    if (!title.value.trim() || !start.value || !end.value) return alert('여행 제목과 날짜를 모두 입력해주세요.');
    if (start.value > end.value) return alert('종료일은 시작일보다 빠를 수 없어요.');
    const latest = readTripData();
    if (!latest) return;
    latest.trips = latest.trips.map((item: any) => item.id === trip.id ? { ...item, title: title.value.trim(), startDate: start.value, endDate: end.value } : item);
    localStorage.setItem('tripflow-v2', JSON.stringify(latest));
    window.dispatchEvent(new StorageEvent('storage', { key: 'tripflow-v2', newValue: JSON.stringify(latest) }));
    window.location.reload();
  });
  const firstChoice = tripsModal.querySelector('.trip-choice');
  if (firstChoice) firstChoice.before(editor);
  else tripsModal.appendChild(editor);
}

function moveShareIntoTripsMenu() {
  const shareButton = document.querySelector<HTMLButtonElement>('button[aria-label="여행 내보내기"]');
  const tripsModal = Array.from(document.querySelectorAll<HTMLElement>('.modal')).find(
    modal => modal.querySelector('h2')?.textContent?.trim() === '내 여행',
  );
  if (!tripsModal) return;
  addTripEditor(tripsModal);
  if (!shareButton || tripsModal.querySelector('[data-tripflow-share-menu]')) return;

  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'trip-choice trip-share-menu-choice';
  menuButton.setAttribute('data-tripflow-share-menu', '');
  const title = document.createElement('b');
  title.textContent = '여행 공유';
  const description = document.createElement('small');
  description.textContent = 'PDF · PNG로 저장하고 공유하기';
  menuButton.append(title, description);
  menuButton.addEventListener('click', () => shareButton.click());
  const divider = tripsModal.querySelector('hr');
  if (divider) divider.before(menuButton);
  else tripsModal.appendChild(menuButton);
}

function syncScheduleUx() {
  moveSummaryBelowTimeline();
  moveShareIntoTripsMenu();
}

export default function TimelineUxRefinements() {
  useEffect(() => {
    syncScheduleUx();
    const observer = new MutationObserver(syncScheduleUx);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <style jsx global>{`
    .day-title { margin-left: 12px !important; margin-bottom: 4px !important; }
    .day-title + .timeline { padding-top: 8px !important; }
    @media (max-width: 520px) { .day-title { margin-left: 12px !important; margin-bottom: 4px !important; } .day-title + .timeline { padding-top: 8px !important; } }
    .timeline + .summary { margin: 2px 0 18px; }
    button[aria-label='여행 내보내기'] { display: none !important; }
    .trip-share-menu-choice { text-align: left; border-color: rgba(95,119,93,.12) !important; background: rgba(233,238,229,.58) !important; }
    .trip-share-menu-choice b,.trip-share-menu-choice small { display:block; }
    .trip-share-menu-choice small { margin-top:4px;color:#748078; }
    .trip-menu-editor { margin: 12px 0 18px; padding: 16px; border-radius: 18px; background: rgba(233,238,229,.52); border: 1px solid rgba(95,119,93,.1); }
    .trip-menu-editor h3 { margin-bottom: 8px; }
    .trip-menu-editor label { margin: 9px 0; }
    .trip-menu-editor .primary { margin-top: 6px; }
    .timeline-subitems { gap:6px;margin-top:9px;margin-bottom:0!important; }
    .timeline-subitem { font-size:13px!important;line-height:1.45!important;color:#536159!important;gap:8px!important;margin-bottom:0!important; }
    .timeline-subitem:before { content:'•'!important;color:#7f8c84!important;font-size:14px;line-height:1.35; }
    .compact-schedule-card .tf-place-details,.compact-schedule-card .timeline-place-note { margin-bottom:0!important; }
    .timeline-row:has(.timeline-place-note),.timeline-row:has(.tf-place-details),.timeline-row:has(.timeline-subitems) { margin-bottom:12px!important; }
    .tf-timeline-sheet:has(.tf-gap-tabs button:first-child.active) .tf-fit-gap { display:none!important; }
    .tf-timeline-sheet:has(.tf-gap-tabs button:nth-child(2).active):not(:has(.tf-gap-list .tf-gap-item)) .tf-fit-gap { display:none!important; }
  `}</style>;
}
