'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppData, InboxItem, Schedule } from '@/lib/types';
import { INBOX_ICON_KEY, type InboxIconMap } from '@/lib/inboxPresentation';

const STORAGE_KEY = 'tripflow-v2';
const NOTE_ATTRIBUTE = 'data-timeline-place-note';
const SUBITEM_ATTRIBUTE = 'data-timeline-subitems';
const ICONS = ['📍','🍜','🍣','☕','🍰','🛍️','🏛️','🏯','🌿','🌊','♨️','🎡','📸','🎫','🚆','🚌','🚕','🚶','🏨','✈️','⭐','✨'];

type SubItem = { id:string; title:string };
type ExtendedSchedule = Schedule & { subItems?:SubItem[] };
type GapInfo = { start:string; end:string; date:string };

type EditorMode =
  | { kind:'icon'; scheduleId:string }
  | { kind:'subitems'; scheduleId:string }
  | { kind:'gap'; gap:GapInfo }
  | null;

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function readAppData(): AppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as AppData : null;
  } catch {
    return null;
  }
}

function writeAppData(next:AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.location.reload();
}

function readIcons(): InboxIconMap {
  try {
    const raw = localStorage.getItem(INBOX_ICON_KEY);
    return raw ? JSON.parse(raw) as InboxIconMap : {};
  } catch {
    return {};
  }
}

function toMin(value:string) {
  const [hour,minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function gapMinutes(gap:GapInfo) {
  return Math.max(1, toMin(gap.end) - toMin(gap.start));
}

function currentTimelineDate(appData:AppData) {
  const activeLabel = document.querySelector<HTMLElement>('.date-strip button.active small')?.textContent?.trim();
  const trip = appData.trips.find(item => item.id === appData.activeTripId) || appData.trips[0];
  if (!trip || !activeLabel) return trip?.startDate || '';
  const [month,day] = activeLabel.split('/').map(Number);
  const start = new Date(`${trip.startDate}T00:00:00`);
  const end = new Date(`${trip.endDate}T00:00:00`);
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (cursor.getMonth() + 1 === month && cursor.getDate() === day) {
      const y = cursor.getFullYear();
      const m = String(month).padStart(2,'0');
      const d = String(day).padStart(2,'0');
      return `${y}-${m}-${d}`;
    }
  }
  return trip.startDate;
}

function deleteSchedule(scheduleId:string) {
  const data = readAppData();
  if (!data) return;
  const schedule = data.schedules.find(item => item.id === scheduleId);
  if (!schedule || !window.confirm(`‘${schedule.title}’ 일정을 삭제할까요?`)) return;
  writeAppData({ ...data, schedules: data.schedules.filter(item => item.id !== scheduleId) });
}

function syncTimelineDecorations() {
  const appData = readAppData();
  if (!appData) return;
  const schedulesById = new Map(appData.schedules.map(schedule => [schedule.id, schedule as ExtendedSchedule]));

  document.querySelectorAll<HTMLElement>('.schedule-card[data-schedule-id]').forEach(card => {
    const scheduleId = card.dataset.scheduleId;
    const schedule = scheduleId ? schedulesById.get(scheduleId) : undefined;
    if (!schedule) return;

    const note = schedule.note?.trim() || '';
    let noteElement = card.querySelector<HTMLElement>(`[${NOTE_ATTRIBUTE}]`);
    if (!note) noteElement?.remove();
    else {
      if (!noteElement) {
        noteElement = document.createElement('p');
        noteElement.setAttribute(NOTE_ATTRIBUTE, '');
        noteElement.className = 'timeline-place-note';
        card.appendChild(noteElement);
      }
      if (noteElement.textContent !== note) noteElement.textContent = note;
    }

    const subItems = schedule.subItems?.filter(item => item.title.trim()) || [];
    let list = card.querySelector<HTMLElement>(`[${SUBITEM_ATTRIBUTE}]`);
    if (!subItems.length) list?.remove();
    else {
      const signature = JSON.stringify(subItems.map(item => item.title.trim()));
      if (!list) {
        list = document.createElement('div');
        list.setAttribute(SUBITEM_ATTRIBUTE, '');
        list.className = 'timeline-subitems';
        card.appendChild(list);
      }
      if (list.dataset.signature !== signature) {
        list.dataset.signature = signature;
        list.replaceChildren(...subItems.map(item => {
          const row = document.createElement('div');
          row.className = 'timeline-subitem';
          row.textContent = item.title.trim();
          return row;
        }));
      }
    }
  });

  const editModal = Array.from(document.querySelectorAll<HTMLElement>('.modal')).find(modal => modal.querySelector('h2')?.textContent?.trim() === '일정 수정');
  if (editModal && !editModal.querySelector('[data-timeline-edit-actions]')) {
    const actions = document.createElement('div');
    actions.setAttribute('data-timeline-edit-actions','');
    actions.className = 'timeline-edit-extra-actions';
    actions.innerHTML = '<button type="button" class="ghost full" data-timeline-subitems-action>하위목록 관리</button><button type="button" class="ghost full timeline-delete-text" data-timeline-delete-action>일정 삭제</button>';
    editModal.appendChild(actions);
  }
}

export default function TimelineDisplayEnhancements() {
  const [editor,setEditor] = useState<EditorMode>(null);
  const [selectedScheduleId,setSelectedScheduleId] = useState<string>('');
  const [gapTab,setGapTab] = useState<'inbox'|'place'|'manual'>('inbox');
  const [fitGap,setFitGap] = useState(false);
  const [query,setQuery] = useState('');
  const [places,setPlaces] = useState<any[]>([]);
  const [searching,setSearching] = useState(false);
  const [manualTitle,setManualTitle] = useState('');
  const [manualAddress,setManualAddress] = useState('');
  const [manualDuration,setManualDuration] = useState(60);
  const [subItems,setSubItems] = useState<SubItem[]>([]);

  useEffect(() => {
    syncTimelineDecorations();
    const observer = new MutationObserver(syncTimelineDecorations);
    observer.observe(document.body, { childList:true, subtree:true });

    const handleClick = (event:MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const icon = target.closest<HTMLElement>('.schedule-place-emoji');
      if (icon) {
        const card = icon.closest<HTMLElement>('.schedule-card[data-schedule-id]');
        const scheduleId = card?.dataset.scheduleId;
        if (scheduleId) {
          event.preventDefault();
          event.stopPropagation();
          setSelectedScheduleId(scheduleId);
          setEditor({ kind:'icon', scheduleId });
        }
        return;
      }

      const gapButton = target.closest<HTMLButtonElement>('button.gap');
      if (gapButton) {
        const match = gapButton.textContent?.match(/(\d{2}:\d{2})[–-](\d{2}:\d{2})/);
        const data = readAppData();
        if (match && data) {
          event.preventDefault();
          event.stopPropagation();
          setGapTab('inbox');
          setFitGap(false);
          setQuery('');
          setPlaces([]);
          setManualTitle('');
          setManualAddress('');
          setManualDuration(60);
          setEditor({ kind:'gap', gap:{ start:match[1], end:match[2], date:currentTimelineDate(data) } });
        }
        return;
      }

      const card = target.closest<HTMLElement>('.schedule-card[data-schedule-id]');
      if (card?.dataset.scheduleId) setSelectedScheduleId(card.dataset.scheduleId);

      if (target.closest('[data-timeline-subitems-action]')) {
        event.preventDefault();
        event.stopPropagation();
        if (!selectedScheduleId) return;
        const data = readAppData();
        const item = data?.schedules.find(schedule => schedule.id === selectedScheduleId) as ExtendedSchedule | undefined;
        setSubItems(item?.subItems?.length ? item.subItems.map(sub => ({...sub})) : []);
        setEditor({ kind:'subitems', scheduleId:selectedScheduleId });
        return;
      }

      if (target.closest('[data-timeline-delete-action]')) {
        event.preventDefault();
        event.stopPropagation();
        if (selectedScheduleId) deleteSchedule(selectedScheduleId);
      }
    };

    document.addEventListener('click', handleClick, true);
    window.addEventListener('storage', syncTimelineDecorations);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('storage', syncTimelineDecorations);
    };
  }, [selectedScheduleId]);

  const data = typeof window !== 'undefined' ? readAppData() : null;
  const activeTrip = data?.trips.find(item => item.id === data.activeTripId) || data?.trips[0];
  const gap = editor?.kind === 'gap' ? editor.gap : null;
  const inbox = useMemo(() => data && activeTrip ? data.inbox.filter(item => item.tripId === activeTrip.id) : [], [data, activeTrip]);

  const saveIcon = (icon:string) => {
    if (editor?.kind !== 'icon') return;
    const icons = readIcons();
    if (icon) icons[editor.scheduleId] = icon;
    else delete icons[editor.scheduleId];
    localStorage.setItem(INBOX_ICON_KEY, JSON.stringify(icons));
    window.location.reload();
  };

  const addGapSchedule = (base:Partial<Schedule> & Pick<Schedule,'title'|'type'|'duration'>) => {
    if (!gap || !data || !activeTrip) return;
    const duration = fitGap ? gapMinutes(gap) : Math.max(1, Number(base.duration) || 60);
    const schedule:Schedule = {
      id:uid(),
      tripId:activeTrip.id,
      title:base.title,
      date:gap.date,
      start:gap.start,
      duration,
      type:base.type,
      address:base.address,
      location:base.location,
      openingHours:base.openingHours,
      placeType:base.placeType,
      mapUrl:base.mapUrl,
      note:base.note,
    };
    writeAppData({ ...data, schedules:[...data.schedules, schedule] });
  };

  const searchPlaces = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const response = await fetch('/api/places/search?q=' + encodeURIComponent(query.trim()));
      const result = await response.json();
      setPlaces(result.places || []);
    } finally {
      setSearching(false);
    }
  };

  const saveSubItems = () => {
    if (editor?.kind !== 'subitems' || !data) return;
    const cleaned = subItems.map(item => ({ ...item, title:item.title.trim() })).filter(item => item.title);
    writeAppData({
      ...data,
      schedules:data.schedules.map(schedule => schedule.id === editor.scheduleId ? { ...schedule, subItems:cleaned } as ExtendedSchedule : schedule),
    });
  };

  return <>
    <style jsx global>{`
      .timeline .transfer{display:none}
      .compact-schedule-card .card-head>.icon{display:none!important}
      .schedule-place-emoji{cursor:pointer;border-radius:8px;padding:2px;margin:-2px;position:relative;z-index:3}
      .schedule-place-emoji:active{background:#eef2ef}
      .timeline-place-note{margin:6px 0 0;color:#87918b;font-size:11px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
      .timeline-subitems{margin:8px 0 0 29px;padding-left:0;display:grid;gap:5px}
      .timeline-subitem{font-size:12px;line-height:1.4;color:#68756e;display:flex;gap:7px;align-items:flex-start}
      .timeline-subitem:before{content:'↳';color:#9aa59e;flex:none}
      .timeline-edit-extra-actions{display:grid;gap:8px;margin-top:10px}
      .timeline-delete-text{color:#a7443e!important}
      .tf-timeline-layer{position:fixed;inset:0;z-index:220;background:rgba(14,24,19,.46);display:flex;align-items:flex-end;justify-content:center}
      .tf-timeline-sheet{width:min(100%,560px);max-height:88dvh;overflow:auto;background:#f8f8f3;border-radius:26px 26px 0 0;padding:24px 18px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -12px 40px rgba(20,35,27,.16)}
      .tf-timeline-sheet h2{margin:0 42px 5px 0}.tf-timeline-sheet .desc{margin:0 0 16px;color:#728071;font-size:13px;line-height:1.5}
      .tf-timeline-close{position:absolute;right:18px;top:18px;border:0;background:#e9eee5;width:36px;height:36px;border-radius:999px;font-size:20px}
      .tf-timeline-sheet-wrap{position:relative}
      .tf-icon-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin:15px 0}.tf-icon-grid button{border:1px solid #e0e6e2;background:#fff;border-radius:12px;min-height:44px;font-size:23px}.tf-icon-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tf-danger{background:#fff0ef!important;color:#9c3f39!important}
      .tf-gap-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;background:#e9eee5;padding:4px;border-radius:14px;margin-bottom:12px}.tf-gap-tabs button{border:0;background:transparent;border-radius:11px;padding:9px 5px;font-weight:800;color:#69766e}.tf-gap-tabs button.active{background:#fff;color:#24372d;box-shadow:0 2px 8px rgba(23,35,29,.07)}
      .tf-fit-gap{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border:1px solid #e1e7e2;border-radius:14px;padding:11px 13px;margin-bottom:12px}.tf-fit-gap span{font-size:13px;font-weight:800}.tf-fit-gap small{display:block;font-weight:500;color:#7c8780;margin-top:2px}.tf-fit-gap input{width:20px;height:20px;flex:none}
      .tf-gap-list{display:grid;gap:8px}.tf-gap-item{background:#fff;border:1px solid #e2e7e3;border-radius:15px;padding:12px}.tf-gap-item h3{font-size:15px;margin:0 0 3px}.tf-gap-item p{margin:0 0 9px;color:#7b867f;font-size:11px}.tf-gap-item button{width:100%}
      .tf-search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-bottom:11px}.tf-search-row input{border:1px solid #dfe5e1;background:#fff;border-radius:13px;padding:11px}.tf-search-row button{border:0;background:#20382b;color:#fff;border-radius:13px;padding:0 15px;font-weight:850}
      .tf-manual-grid{display:grid;gap:10px}.tf-manual-grid label{margin:0}.tf-manual-grid input{background:#fff}
      .tf-subitem-list{display:grid;gap:8px;margin:13px 0}.tf-subitem-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.tf-subitem-row input{background:#fff}.tf-subitem-row button{border:0;background:#eef2ef;border-radius:12px;width:42px;color:#9c3f39;font-size:18px}.tf-add-subitem{width:100%;border:1px dashed #9eafa3;background:#f3f7f4;color:#31443a;border-radius:13px;padding:11px;font-weight:850;margin-bottom:10px}
    `}</style>

    {editor && <div className="tf-timeline-layer" onMouseDown={event => event.currentTarget === event.target && setEditor(null)}>
      <div className="tf-timeline-sheet tf-timeline-sheet-wrap">
        <button className="tf-timeline-close" aria-label="닫기" onClick={() => setEditor(null)}>×</button>

        {editor.kind === 'icon' && <>
          <h2>아이콘 수정</h2>
          <p className="desc">타임라인에서 보일 아이콘을 바꾸거나 이 일정을 삭제할 수 있어요.</p>
          <div className="tf-icon-grid">{ICONS.map(icon => <button key={icon} onClick={() => saveIcon(icon)}>{icon}</button>)}</div>
          <div className="tf-icon-tools">
            <button className="ghost" onClick={() => saveIcon('')}>자동 아이콘</button>
            <button className="ghost tf-danger" onClick={() => deleteSchedule(editor.scheduleId)}>일정 삭제</button>
          </div>
        </>}

        {editor.kind === 'subitems' && <>
          <h2>하위목록</h2>
          <p className="desc">큰 일정의 시간은 그대로 두고, 패키지 투어의 세부 코스처럼 시간 없는 하위 장소를 순서대로 적어둘 수 있어요.</p>
          <div className="tf-subitem-list">{subItems.map((item,index) => <div className="tf-subitem-row" key={item.id}>
            <input value={item.title} placeholder={`세부 코스 ${index + 1}`} onChange={event => setSubItems(current => current.map((row,i) => i === index ? { ...row, title:event.target.value } : row))}/>
            <button aria-label="하위목록 삭제" onClick={() => setSubItems(current => current.filter((_,i) => i !== index))}>×</button>
          </div>)}</div>
          <button className="tf-add-subitem" onClick={() => setSubItems(current => [...current,{ id:uid(), title:'' }])}>+ 하위 코스 추가</button>
          <button className="primary full" onClick={saveSubItems}>하위목록 저장</button>
        </>}

        {editor.kind === 'gap' && gap && <>
          <h2>{gap.start}–{gap.end} 빈 시간</h2>
          <p className="desc">Inbox뿐 아니라 장소 검색이나 직접 입력으로 바로 채울 수 있어요.</p>
          <div className="tf-gap-tabs">
            <button className={gapTab === 'inbox' ? 'active' : ''} onClick={() => setGapTab('inbox')}>Inbox</button>
            <button className={gapTab === 'place' ? 'active' : ''} onClick={() => setGapTab('place')}>장소 검색</button>
            <button className={gapTab === 'manual' ? 'active' : ''} onClick={() => setGapTab('manual')}>직접 입력</button>
          </div>
          <label className="tf-fit-gap"><span>빈 시간에 딱 맞추기<small>{gapMinutes(gap)}분 전체를 일정 시간으로 사용</small></span><input type="checkbox" checked={fitGap} onChange={event => setFitGap(event.target.checked)}/></label>

          {gapTab === 'inbox' && <div className="tf-gap-list">{inbox.map(item => <GapInboxItem key={item.id} item={item} add={() => addGapSchedule(item)}/>)}{!inbox.length && <p className="empty">Inbox에 저장된 장소가 없어요.</p>}</div>}

          {gapTab === 'place' && <>
            <div className="tf-search-row"><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && searchPlaces()} placeholder="장소명 검색"/><button onClick={searchPlaces}>{searching ? '…' : '검색'}</button></div>
            <div className="tf-gap-list">{places.map(place => {
              const base = { title:place.displayName?.text || query, duration:60, type:'place' as const, address:place.formattedAddress || '', location:place.location ? { lat:place.location.latitude, lng:place.location.longitude } : undefined, openingHours:place.regularOpeningHours?.weekdayDescriptions, mapUrl:place.googleMapsUri };
              return <article className="tf-gap-item" key={place.id || base.title}><h3>{base.title}</h3><p>{base.address || '주소 없음'}</p><button className="primary" onClick={() => addGapSchedule(base)}>이 시간에 넣기</button></article>;
            })}</div>
          </>}

          {gapTab === 'manual' && <div className="tf-manual-grid">
            <label>일정명<input value={manualTitle} onChange={event => setManualTitle(event.target.value)} placeholder="예: 패키지 투어"/></label>
            <label>장소 또는 메모<input value={manualAddress} onChange={event => setManualAddress(event.target.value)} placeholder="선택 사항"/></label>
            {!fitGap && <label>이용 시간(분)<input type="number" min="1" value={manualDuration} onChange={event => setManualDuration(Number(event.target.value))}/></label>}
            <button className="primary full" disabled={!manualTitle.trim()} onClick={() => addGapSchedule({ title:manualTitle.trim(), address:manualAddress.trim(), duration:manualDuration, type:'manual' })}>이 시간에 넣기</button>
          </div>}
        </>}
      </div>
    </div>}
  </>;
}

function GapInboxItem({item,add}:{item:InboxItem;add:()=>void}) {
  return <article className="tf-gap-item"><h3>{item.title}</h3><p>{item.address || '장소 미정'} · 체류 {item.duration}분</p><button className="primary" onClick={add}>이 시간에 넣기</button></article>;
}
