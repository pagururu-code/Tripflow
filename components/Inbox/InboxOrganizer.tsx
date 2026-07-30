'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, FolderHeart, MapPin, Pencil, Plus, X } from 'lucide-react';
import type { AppData, Bucket, InboxItem } from '@/types';

type ItemMeta = { region?:string; bucketIds?:string[] };
type MetaMap = Record<string, ItemMeta>;
type ViewMode = 'all'|'region'|'bucket';

const BUCKET_KEY = 'tripflow-buckets-v1';
const META_KEY = 'tripflow-inbox-meta-v1';
const APP_KEY = 'tripflow-v2';
const DEFAULT_EMOJIS = ['🍛','🍜','🍣','☕','🍰','🛍️','♨️','🌃','📷','🌿','✨'];

const readJSON = <T,>(key:string, fallback:T):T => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
};

function normalize(value:string) { return value.toLowerCase().replace(/\s+/g,' '); }
function todayIndex() { const day = new Date().getDay(); return day === 0 ? 6 : day - 1; }
function timePart(value:string) { const index = value.indexOf(':'); return index >= 0 ? value.slice(index + 1).trim() : value; }

function inferRegion(item:InboxItem, city:string) {
  const text = normalize(`${item.title} ${item.address || ''}`);
  const aliases:[RegExp,string][] = [
    [/(susukino|すすきの|ススキノ|薄野|스스키노|狸小路|tanukikoji|다누키코지)/i,'스스키노'],
    [/(odori|大通|오도리|二条市場|nijo market|니조시장)/i,'오도리'],
    [/(sapporo station|札幌駅|삿포로역|jr tower|ステラプレイス)/i,'삿포로역'],
    [/(maruyama|円山|마루야마|北海道神宮)/i,'마루야마'],
    [/(nakajima|中島公園|나카지마)/i,'나카지마공원'],
    [/(otaru|小樽|오타루)/i,'오타루'], [/(shibuya|渋谷|시부야)/i,'시부야'],
    [/(shinjuku|新宿|신주쿠)/i,'신주쿠'], [/(asakusa|浅草|아사쿠사)/i,'아사쿠사'],
    [/(ueno|上野|우에노)/i,'우에노'], [/(ginza|銀座|긴자)/i,'긴자'],
    [/(namba|難波|なんば|난바)/i,'난바'], [/(umeda|梅田|우메다)/i,'우메다'],
    [/(shinsaibashi|心斎橋|신사이바시)/i,'신사이바시'], [/(gion|祇園|기온)/i,'기온'],
    [/(arashiyama|嵐山|아라시야마)/i,'아라시야마'], [/(seongsu|성수)/i,'성수'],
    [/(hongdae|홍대|연남)/i,'홍대·연남'], [/(myeongdong|명동)/i,'명동'],
  ];
  const matched = aliases.find(([pattern]) => pattern.test(text));
  if (matched) return matched[1];
  const address = item.address || '';
  const station = address.match(/([\p{L}\d·.\- ]{2,20})(?:역|駅| Station)/u);
  if (station?.[1]) return `${station[1].trim()}역`;
  const ward = address.match(/([\p{L}]{2,16})(?:구|区| Ward)/u);
  if (ward?.[1]) return ward[1].trim();
  const cityMatch = address.match(/([\p{L}]{2,18})(?:시|市| City)/u);
  if (cityMatch?.[1] && !normalize(city).includes(normalize(cityMatch[1]))) return cityMatch[1].trim();
  return city || '지역 미정';
}

function Card({item,onOpen}:{item:InboxItem;onOpen:()=>void}) {
  return <button className="tf-organizer-card" onClick={onOpen}><h3>{item.title}</h3></button>;
}

export default function InboxOrganizer() {
  const [host, setHost] = useState<HTMLElement|null>(null);
  const [data, setData] = useState<AppData|null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [meta, setMeta] = useState<MetaMap>({});
  const [view, setView] = useState<ViewMode>('all');
  const [selected, setSelected] = useState<InboxItem|null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [newBucket, setNewBucket] = useState(false);
  const [bucketName, setBucketName] = useState('');
  const [bucketEmoji, setBucketEmoji] = useState('✨');
  const [regionDraft, setRegionDraft] = useState('');

  useEffect(() => {
    let lastRaw = '';
    const sync = () => {
      const raw = localStorage.getItem(APP_KEY) || '';
      if (raw !== lastRaw) { lastRaw = raw; setData(readJSON<AppData|null>(APP_KEY, null)); }
      setBuckets(readJSON<Bucket[]>(BUCKET_KEY, []));
      setMeta(readJSON<MetaMap>(META_KEY, {}));
      const panel = [...document.querySelectorAll<HTMLElement>('.panel')].find(el => el.querySelector('h2')?.textContent?.trim() === 'Inbox');
      if (!panel) { setHost(null); return; }
      panel.classList.add('tf-organized-inbox');
      let node = panel.querySelector<HTMLElement>('[data-tripflow-organizer]');
      if (!node) { node = document.createElement('div'); node.dataset.tripflowOrganizer = 'true'; panel.querySelector('.section-title')?.insertAdjacentElement('afterend', node); }
      setHost(node);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true});
    const timer = window.setInterval(sync,700);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, []);

  const trip = data?.trips.find(t => t.id === data.activeTripId) || data?.trips[0];
  const items = useMemo(() => data && trip ? data.inbox.filter(item => item.tripId === trip.id) : [], [data, trip]);
  const tripBuckets = useMemo(() => trip ? buckets.filter(bucket => bucket.tripId === trip.id) : [], [buckets, trip]);

  useEffect(() => {
    if (!trip || !items.length) return;
    let changed = false; const next = {...meta};
    items.forEach(item => { if (!next[item.id]?.region) { next[item.id] = {...next[item.id],region:inferRegion(item,trip.city),bucketIds:next[item.id]?.bucketIds||[]}; changed = true; } });
    if (changed) { setMeta(next); localStorage.setItem(META_KEY,JSON.stringify(next)); }
  }, [items,trip]);

  const saveMeta = (next:MetaMap) => { setMeta(next); localStorage.setItem(META_KEY,JSON.stringify(next)); };
  const saveBuckets = (next:Bucket[]) => { setBuckets(next); localStorage.setItem(BUCKET_KEY,JSON.stringify(next)); };
  const openOriginal = (item:InboxItem) => {
    const index = items.findIndex(entry => entry.id === item.id);
    const cards = document.querySelectorAll<HTMLElement>('.tf-organized-inbox > .inbox-card');
    setSelected(null); setEditingMeta(false); cards[index]?.click();
  };
  const openDetail = (item:InboxItem) => { setSelected(item); setEditingMeta(false); setRegionDraft(meta[item.id]?.region || (trip ? inferRegion(item,trip.city) : '지역 미정')); };

  const groupedRegions = useMemo(() => {
    const groups = new Map<string,InboxItem[]>();
    items.forEach(item => { const region = meta[item.id]?.region || (trip ? inferRegion(item,trip.city) : '지역 미정'); groups.set(region,[...(groups.get(region)||[]),item]); });
    return [...groups.entries()].sort((a,b) => a[0].localeCompare(b[0],'ko'));
  }, [items,meta,trip]);

  const addBucket = () => {
    if (!trip || !bucketName.trim()) return;
    saveBuckets([...buckets,{id:crypto.randomUUID(),tripId:trip.id,name:bucketName.trim(),emoji:bucketEmoji||'✨'}]);
    setBucketName(''); setBucketEmoji('✨'); setNewBucket(false);
  };

  if (!host || !data || !trip) return null;
  const todayHours = selected?.openingHours?.[todayIndex()];
  const selectedTags = selected ? tripBuckets.filter(bucket => meta[selected.id]?.bucketIds?.includes(bucket.id)) : [];

  return createPortal(<>
    <style>{`
      .tf-organized-inbox>.inbox-card,.tf-organized-inbox>.empty{display:none!important}.tf-organizer{margin:14px 0 0}.tf-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#eef2ef;padding:4px;border-radius:14px;margin-bottom:14px}.tf-tabs button{border:0;background:transparent;padding:10px 6px;border-radius:11px;font-weight:800;color:#6a746f}.tf-tabs button.active{background:#fff;color:#17231d;box-shadow:0 3px 10px rgba(23,35,29,.08)}.tf-organizer-list{display:grid;gap:9px}.tf-organizer-card{width:100%;background:#fff;border:1px solid #e5e9e6;border-radius:15px;padding:16px;text-align:left;box-shadow:0 4px 13px rgba(23,35,29,.035)}.tf-organizer-card h3{margin:0;font-size:16px;color:#1d3026}.tf-group{margin-bottom:18px}.tf-group-head{display:flex;justify-content:space-between;align-items:center;margin:0 2px 9px}.tf-group-head h3{margin:0;font-size:17px}.tf-group-head span{font-size:12px;color:#76807b}.tf-bucket-empty{border:1px dashed #cad4cd;border-radius:16px;padding:18px;text-align:center;color:#758079;background:#f8faf8}.tf-add-bucket{width:100%;border:1px dashed #9cac9f;background:#f3f7f4;color:#21392c;border-radius:16px;padding:13px;font-weight:850;display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:12px}.tf-new-bucket{display:grid;grid-template-columns:70px 1fr;gap:8px;margin-bottom:10px}.tf-new-bucket button{grid-column:1/-1}.tf-detail-backdrop{position:fixed;inset:0;background:rgba(14,24,19,.48);z-index:120;display:flex;align-items:flex-end;justify-content:center}.tf-detail-sheet{background:#fff;width:min(100%,560px);max-height:88vh;overflow:auto;border-radius:24px 24px 0 0;padding:25px 19px calc(25px + env(safe-area-inset-bottom));position:relative}.tf-detail-close{position:absolute;right:14px;top:14px;border:0;background:#eef2ef;border-radius:999px;width:36px;height:36px;display:grid;place-items:center}.tf-detail-sheet h2{margin:0 46px 20px 0;font-size:25px}.tf-detail-row{padding:14px 0;border-top:1px solid #edf0ee}.tf-detail-row b{display:block;font-size:12px;color:#78827d;margin-bottom:7px}.tf-detail-row p{margin:0;line-height:1.55;color:#24372d}.tf-map-link{display:flex;align-items:center;justify-content:space-between;text-decoration:none;color:#183d2a;font-weight:850;background:#eff5f1;padding:13px 14px;border-radius:14px}.tf-week-hours{margin-top:7px}.tf-week-hours summary{font-weight:850;cursor:pointer}.tf-week-list{margin-top:10px;background:#f6f8f6;border-radius:13px;padding:10px 12px}.tf-week-list p{font-size:13px;margin:5px 0}.tf-tag-row{display:flex;flex-wrap:wrap;gap:6px}.tf-tag-row span{background:#edf4ef;color:#31443a;border-radius:999px;padding:6px 9px;font-size:12px;font-weight:750}.tf-detail-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px}.tf-detail-actions button{border:0;border-radius:14px;padding:14px;font-weight:900}.tf-meta-button{background:#edf3ef;color:#24372d}.tf-edit-button{background:#17231d;color:#fff;display:flex;align-items:center;justify-content:center;gap:7px}.tf-meta-editor label{display:block;margin-top:16px;font-weight:800}.tf-meta-editor input{width:100%;margin-top:7px}.tf-checks{display:grid;gap:8px;margin-top:8px}.tf-checks button{display:flex;justify-content:space-between;align-items:center;border:1px solid #dfe5e1;background:#fff;border-radius:14px;padding:12px 13px;text-align:left;font-weight:750}.tf-checks button.active{background:#e9f2ec;border-color:#8da598}.tf-meta-save{width:100%;margin-top:20px;border:0;background:#17231d;color:white;border-radius:15px;padding:14px;font-weight:900}
    `}</style>
    <section className="tf-organizer">
      <div className="tf-tabs">{([['all','전체'],['region','지역'],['bucket','버킷']] as const).map(([key,label])=><button key={key} className={view===key?'active':''} onClick={()=>setView(key)}>{label}</button>)}</div>
      {view==='all'&&<div className="tf-organizer-list">{items.map(item=><Card key={item.id} item={item} onOpen={()=>openDetail(item)}/>)}{!items.length&&<p className="tf-bucket-empty">아직 Inbox 후보가 없어요.</p>}</div>}
      {view==='region'&&<div>{groupedRegions.map(([region,list])=><section className="tf-group" key={region}><div className="tf-group-head"><h3>📍 {region}</h3><span>{list.length}곳</span></div><div className="tf-organizer-list">{list.map(item=><Card key={item.id} item={item} onOpen={()=>openDetail(item)}/>)}</div></section>)}</div>}
      {view==='bucket'&&<div><button className="tf-add-bucket" onClick={()=>setNewBucket(v=>!v)}><Plus size={16}/>버킷 먼저 만들기</button>{newBucket&&<div className="tf-new-bucket"><select value={bucketEmoji} onChange={e=>setBucketEmoji(e.target.value)}>{DEFAULT_EMOJIS.map(emoji=><option key={emoji}>{emoji}</option>)}</select><input value={bucketName} onChange={e=>setBucketName(e.target.value)} placeholder="예: 스프카레" onKeyDown={e=>e.key==='Enter'&&addBucket()}/><button className="primary" onClick={addBucket}>버킷 만들기</button></div>}{tripBuckets.map(bucket=>{const list=items.filter(item=>meta[item.id]?.bucketIds?.includes(bucket.id));return <section className="tf-group" key={bucket.id}><div className="tf-group-head"><h3>{bucket.emoji} {bucket.name}</h3><span>{list.length}곳</span></div>{list.length?<div className="tf-organizer-list">{list.map(item=><Card key={item.id} item={item} onOpen={()=>openDetail(item)}/>)}</div>:<div className="tf-bucket-empty">아직 후보가 없어요.<br/>장소를 찾은 뒤 이 버킷에 넣어주세요.</div>}</section>})}{!tripBuckets.length&&!newBucket&&<div className="tf-bucket-empty"><FolderHeart size={25}/><br/>“스프카레”, “야경”처럼<br/>하고 싶은 것부터 만들어보세요.</div>}</div>}
    </section>
    {selected&&<div className="tf-detail-backdrop" onMouseDown={e=>e.currentTarget===e.target&&setSelected(null)}><div className="tf-detail-sheet"><button className="tf-detail-close" onClick={()=>setSelected(null)}><X size={18}/></button>{!editingMeta?<><h2>{selected.title}</h2>{selected.address&&<div className="tf-detail-row"><b>주소</b><p><MapPin size={14}/> {selected.address}</p></div>}<div className="tf-detail-row"><b>타입</b><p>{selected.placeType || '타입 정보 없음'}</p></div>{selected.mapUrl&&<div className="tf-detail-row"><a className="tf-map-link" href={selected.mapUrl} target="_blank" rel="noreferrer"><span>Google Maps에서 보기</span><ExternalLink size={17}/></a></div>}<div className="tf-detail-row"><b>오늘 영업시간</b><p>{todayHours ? timePart(todayHours) : '영업시간 정보 없음'}</p>{selected.openingHours?.length&&<details className="tf-week-hours"><summary>요일별 영업시간</summary><div className="tf-week-list">{selected.openingHours.map(line=><p key={line}>{line}</p>)}</div></details>}</div>{selectedTags.length>0&&<div className="tf-detail-row"><b>버킷</b><div className="tf-tag-row">{selectedTags.map(tag=><span key={tag.id}>{tag.emoji} {tag.name}</span>)}</div></div>}<div className="tf-detail-actions"><button className="tf-meta-button" onClick={()=>setEditingMeta(true)}>지역·버킷</button><button className="tf-edit-button" onClick={()=>openOriginal(selected)}><Pencil size={16}/>수정</button></div></>:<div className="tf-meta-editor"><h2>지역·버킷 수정</h2><label>지역<input value={regionDraft} onChange={e=>setRegionDraft(e.target.value)} placeholder="예: 스스키노"/></label><label>버킷</label><div className="tf-checks">{tripBuckets.map(bucket=>{const active=meta[selected.id]?.bucketIds?.includes(bucket.id)||false;return <button key={bucket.id} className={active?'active':''} onClick={()=>{const current=meta[selected.id]?.bucketIds||[];const ids=active?current.filter(id=>id!==bucket.id):[...current,bucket.id];saveMeta({...meta,[selected.id]:{...meta[selected.id],region:regionDraft,bucketIds:ids}});}}><span>{bucket.emoji} {bucket.name}</span><b>{active?'✓':'+'}</b></button>})}{!tripBuckets.length&&<p className="tf-bucket-empty">먼저 버킷 탭에서 버킷을 만들어주세요.</p>}</div><button className="tf-meta-save" onClick={()=>{saveMeta({...meta,[selected.id]:{...meta[selected.id],region:regionDraft.trim()||inferRegion(selected,trip.city)}});setEditingMeta(false);}}>저장</button></div>}</div></div>}
  </>,host);
}
