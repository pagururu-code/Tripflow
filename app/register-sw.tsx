'use client';

import { useEffect } from 'react';

const hasLeadingEmoji = (value = '') => /^\s*\p{Extended_Pictographic}/u.test(value);
const cleanTitle = (value = '') => value.replace(/^\s*\p{Extended_Pictographic}(?:\uFE0F)?\s*/u, '').trim();

const placeEmoji = (title = '', placeType = '') => {
  const value = `${title} ${placeType}`.toLocaleLowerCase();
  if (/(cafe|coffee|bakery|dessert|카페|커피|베이커리|제과|디저트|喫茶|珈琲|パン|菓子)/i.test(value)) return '☕';
  if (/(bar|pub|night_club|liquor|술집|라이브 음악|居酒屋|バー|酒場)/i.test(value)) return '🍸';
  if (/(restaurant|food|meal|sushi|ramen|curry|음식점|식당|초밥|스시|소바|카레|야키니쿠|징기스칸|해산물|寿司|蕎麦|料理|焼肉|ラーメン|カレー|鮮魚|ハンバーグ)/i.test(value)) return '🍽️';
  if (/(shopping|store|mall|market|department|supermarket|convenience|쇼핑|상점|시장|백화점|마트|편의점|돈키호테|파르코|다이마루|ロフト|マルシェ|市場|百貨店|商店|コンビニ)/i.test(value)) return '🛍️';
  if (/(park|garden|공원|정원|公園|庭園)/i.test(value)) return '🌿';
  if (/(museum|university|temple|shrine|historic|박물관|대학교|신사|사찰|오르골|大学|博物館|神社|寺|歴史)/i.test(value)) return '🏛️';
  if (/(hotel|lodging|숙소|호텔|ホテル|旅館)/i.test(value)) return '🏨';
  if (/(station|airport|transit|역|공항|駅|空港)/i.test(value)) return '🚉';
  if (/(spa|hot_spring|온천|스파|温泉|銭湯)/i.test(value)) return '♨️';
  return '📍';
};

const categoryOf = (item: any) => ({ '☕':'카페','🍸':'바','🍽️':'음식','🛍️':'쇼핑','🌿':'공원','🏛️':'관광','🏨':'숙소','🚉':'교통','♨️':'온천','📍':'기타' } as Record<string,string>)[placeEmoji(item?.title || '', item?.placeType || '')] || '기타';
const regionOf = (address = '') => String(address).match(/[가-힣]+(?:구|동|시)|[一-龠々ヶ]+(?:区|市|町|村)/g)?.at(-1) || '지역 미상';
const distanceKm = (a?: {lat:number;lng:number}, b?: {lat:number;lng:number}) => { if(!a||!b)return Infinity; const r=6371,rad=(n:number)=>n*Math.PI/180,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng),x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2; return 2*r*Math.asin(Math.sqrt(x)); };
const minutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0; };
const clock = (value: number) => { const normalized = ((value % 1440) + 1440) % 1440; return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`; };
const setReactInputValue = (input: HTMLInputElement, value: string) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter?.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); };
const labelText = (label: HTMLLabelElement) => Array.from(label.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent || '').join('').trim();

const enhanceTimeFields = () => {
  document.querySelectorAll<HTMLElement>('.modal').forEach(modal => {
    if (modal.dataset.timeFieldsEnhanced === 'done') return;
    const labels = Array.from(modal.querySelectorAll<HTMLLabelElement>('label'));
    const startLabel = labels.find(label => ['시작', '시작 시간'].includes(labelText(label)));
    const durationLabel = labels.find(label => ['체류(분)', '이용 시간(분)', '소요 시간(분)'].includes(labelText(label)));
    const startInput = startLabel?.querySelector<HTMLInputElement>('input[type="time"]');
    const durationInput = durationLabel?.querySelector<HTMLInputElement>('input[type="number"]');
    if (!startLabel || !durationLabel || !startInput || !durationInput) return;
    modal.dataset.timeFieldsEnhanced = 'done';
    const endLabel = document.createElement('label'); endLabel.append('종료 시간');
    const endInput = document.createElement('input'); endInput.type = 'time'; endInput.setAttribute('aria-label', '종료 시간'); endLabel.appendChild(endInput);
    const row = document.createElement('div'); row.className = 'two time-range-row';
    const oldRow = startLabel.parentElement?.classList.contains('two') ? startLabel.parentElement : null;
    const oldRowHasDate = oldRow ? Array.from(oldRow.querySelectorAll('label')).some(label => labelText(label) === '날짜') : false;
    if (oldRow) { if (oldRowHasDate) oldRow.insertAdjacentElement('afterend', row); else oldRow.insertAdjacentElement('beforebegin', row); } else startLabel.insertAdjacentElement('beforebegin', row);
    row.append(startLabel, endLabel); if (oldRow && oldRow.children.length === 0) oldRow.remove();
    const syncEnd = () => { const duration = Math.max(1, Number(durationInput.value) || 1); endInput.value = clock(minutes(startInput.value || '00:00') + duration); };
    const syncDuration = () => { let difference = minutes(endInput.value) - minutes(startInput.value); if (difference <= 0) difference += 1440; setReactInputValue(durationInput, String(difference)); };
    startInput.addEventListener('input', syncEnd); startInput.addEventListener('change', syncEnd); durationInput.addEventListener('input', syncEnd); durationInput.addEventListener('change', syncEnd); endInput.addEventListener('input', syncDuration); endInput.addEventListener('change', syncDuration); syncEnd();
  });
};

export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const migrationKey = 'tripflow-place-emoji-migration-v1';
    if (!localStorage.getItem(migrationKey)) {
      try { const raw=localStorage.getItem('tripflow-v2'); if(raw){ const data=JSON.parse(raw); let changed=false; const apply=(item:any)=>{ const shouldApply=item?.source==='google-maps'||item?.type==='place'; if(!shouldApply||!item?.title||hasLeadingEmoji(item.title))return item; changed=true; return {...item,title:`${placeEmoji(item.title,item.placeType)} ${item.title}`}; }; const next={...data,inbox:Array.isArray(data.inbox)?data.inbox.map(apply):data.inbox,schedules:Array.isArray(data.schedules)?data.schedules.map(apply):data.schedules}; if(changed)localStorage.setItem('tripflow-v2',JSON.stringify(next)); localStorage.setItem(migrationKey,'done'); if(changed)window.location.reload(); } else localStorage.setItem(migrationKey,'done'); } catch { localStorage.setItem(migrationKey,'done'); }
    }

    const style=document.createElement('style'); style.textContent=`.tf-filterbar{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;margin:12px 0}.tf-filterbar input,.tf-filterbar select{min-width:0;border:1px solid var(--line,#dce4d8);border-radius:12px;background:#fff;padding:10px;font:inherit}.tf-filterbar select{max-width:112px}.gap-enhanced-card{display:grid!important;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'title button' 'meta button';align-items:center;gap:5px 12px;padding:14px 16px!important}.gap-enhanced-card h3{grid-area:title;margin:0}.gap-enhanced-card p{grid-area:meta;margin:0!important}.gap-enhanced-card .primary{grid-area:button;width:auto!important;min-width:70px;padding:10px 13px;border-radius:12px;white-space:nowrap}.tf-distance{font-size:11px;color:var(--muted,#728071);margin-left:6px}.tf-empty-filter{text-align:center;color:var(--muted,#728071);padding:22px}.inbox-search-wrap{margin:12px 0}.inbox-search-wrap input{width:100%;border:1px solid var(--line,#dce4d8);border-radius:14px;background:#fff;padding:12px 14px;font:inherit}@media(max-width:420px){.tf-filterbar{grid-template-columns:1fr 1fr}.tf-filterbar input{grid-column:1/-1}.gap-enhanced-card .primary{min-width:62px;padding:9px 11px;font-size:13px}}`; document.head.appendChild(style);
    const readData=()=>{try{return JSON.parse(localStorage.getItem('tripflow-v2')||'{}')}catch{return {}}};
    const enhanceInbox=()=>{ const panel=[...document.querySelectorAll('section.panel')].find(x=>x.querySelector('h2')?.textContent?.trim()==='Inbox') as HTMLElement|undefined; if(!panel||panel.dataset.searchReady)return; panel.dataset.searchReady='1'; const heading=panel.querySelector('.section-title'); if(!heading)return; const wrap=document.createElement('div'); wrap.className='inbox-search-wrap'; const input=document.createElement('input'); input.type='search'; input.placeholder='Inbox 장소 검색'; wrap.appendChild(input); heading.insertAdjacentElement('afterend',wrap); input.addEventListener('input',()=>{const q=input.value.trim().toLocaleLowerCase(); panel.querySelectorAll<HTMLElement>('.inbox-card').forEach(card=>card.style.display=!q||(card.textContent||'').toLocaleLowerCase().includes(q)?'':'none');}); };
    const enhanceGap=()=>{ const modal=document.querySelector('.modal') as HTMLElement|null, heading=modal?.querySelector('h2'); if(!modal||!heading||!/^\d{2}:\d{2}–\d{2}:\d{2}$/.test(heading.textContent?.trim()||'')||modal.dataset.gapReady)return; modal.dataset.gapReady='1'; const data=readData(),allItems=Array.isArray(data.inbox)?data.inbox:[],cards=[...modal.querySelectorAll<HTMLElement>('article.result')]; const rows=cards.map((card,index)=>{card.classList.add('gap-enhanced-card'); const title=cleanTitle(card.querySelector('h3')?.textContent||''),item=allItems.find((x:any)=>cleanTitle(x.title)===title)||{}; const button=card.querySelector<HTMLButtonElement>('button.primary'); if(button)button.textContent='넣기'; return {card,item,index,category:categoryOf(item),region:regionOf(item.address)};}); const gapStart=heading.textContent!.slice(0,5), activeDateButton=document.querySelector('.date-strip button.active small')?.textContent||'',trip=(data.trips||[]).find((x:any)=>x.id===data.activeTripId)||(data.trips||[])[0]; const [m,d]=activeDateButton.split('/').map(Number),activeDate=trip&&m&&d?`${String(trip.startDate).slice(0,4)}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:''; const startMin=minutes(gapStart),schedules=(data.schedules||[]).filter((x:any)=>!activeDate||x.date===activeDate).sort((a:any,b:any)=>minutes(a.start)-minutes(b.start)),before=schedules.filter((x:any)=>x.location&&minutes(x.start)+(x.duration||0)<=startMin).at(-1),after=schedules.find((x:any)=>x.location&&minutes(x.start)>=startMin),anchor=before?.location||after?.location; rows.forEach(row=>{row.item._distance=distanceKm(anchor,row.item.location); if(Number.isFinite(row.item._distance)){const meta=row.card.querySelector('p'),span=document.createElement('span'); span.className='tf-distance'; span.textContent=`· 약 ${row.item._distance<1?Math.round(row.item._distance*1000)+'m':row.item._distance.toFixed(1)+'km'}`; meta?.appendChild(span);}}); const toolbar=document.createElement('div'); toolbar.className='tf-filterbar'; const search=document.createElement('input'); search.type='search'; search.placeholder='장소 검색'; const category=document.createElement('select'); category.innerHTML='<option value="">전체 태그</option>'+[...new Set(rows.map(x=>x.category))].map(x=>`<option>${x}</option>`).join(''); const region=document.createElement('select'); region.innerHTML='<option value="">전체 지역</option>'+[...new Set(rows.map(x=>x.region).filter(x=>x!=='지역 미상'))].map(x=>`<option>${x}</option>`).join(''); toolbar.append(search,category,region); heading.insertAdjacentElement('afterend',toolbar); const empty=document.createElement('p'); empty.className='tf-empty-filter'; empty.textContent='조건에 맞는 장소가 없어요.'; empty.style.display='none'; modal.appendChild(empty); const apply=()=>{const q=search.value.trim().toLocaleLowerCase(); let visible=0; rows.sort((a,b)=>(a.item._distance??Infinity)-(b.item._distance??Infinity)||a.index-b.index).forEach(row=>{const ok=(!q||(row.card.textContent||'').toLocaleLowerCase().includes(q))&&(!category.value||row.category===category.value)&&(!region.value||row.region===region.value); row.card.style.display=ok?'':'none'; if(ok){visible++; modal.insertBefore(row.card,empty);}}); empty.style.display=visible?'none':'';}; search.addEventListener('input',apply); category.addEventListener('change',apply); region.addEventListener('change',apply); apply(); };
    const enhanceAll=()=>{enhanceTimeFields();enhanceInbox();enhanceGap();}; enhanceAll(); const observer=new MutationObserver(enhanceAll); observer.observe(document.body,{childList:true,subtree:true}); return()=>{observer.disconnect();style.remove();};
  }, []);
  return null;
}
