'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderHeart, MapPin, Plus, X } from 'lucide-react';
import type { AppData, InboxItem } from '@/lib/types';

type Bucket = { id:string; tripId:string; name:string; emoji:string };
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

function inferRegion(item:InboxItem, city:string) {
  const text = normalize(`${item.title} ${item.address || ''}`);
  const aliases:[RegExp,string][] = [
    [/(susukino|すすきの|ススキノ|薄野|스스키노|狸小路|tanukikoji|다누키코지)/i,'스스키노'],
    [/(odori|大通|오도리|二条市場|nijo market|니조시장)/i,'오도리'],
    [/(sapporo station|札幌駅|삿포로역|jr tower|ステラプレイス)/i,'삿포로역'],
    [/(maruyama|円山|마루야마|北海道神宮)/i,'마루야마'],
    [/(nakajima|中島公園|나카지마)/i,'나카지마공원'],
    [/(otaru|小樽|오타루)/i,'오타루'],
    [/(shibuya|渋谷|시부야)/i,'시부야'],
    [/(shinjuku|新宿|신주쿠)/i,'신주쿠'],
    [/(asakusa|浅草|아사쿠사)/i,'아사쿠사'],
    [/(ueno|上野|우에노)/i,'우에노'],
    [/(ginza|銀座|긴자)/i,'긴자'],
    [/(namba|難波|なんば|난바)/i,'난바'],
    [/(umeda|梅田|우메다)/i,'우메다'],
    [/(shinsaibashi|心斎橋|신사이바시)/i,'신사이바시'],
    [/(gion|祇園|기온)/i,'기온'],
    [/(arashiyama|嵐山|아라시야마)/i,'아라시야마'],
    [/(seongsu|성수)/i,'성수'],
    [/(hongdae|홍대|연남)/i,'홍대·연남'],
    [/(myeongdong|명동)/i,'명동'],
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

function Card({item,meta,buckets,onEditMeta,onOpenOriginal}:{item:InboxItem;meta:ItemMeta;buckets:Bucket[];onEditMeta:()=>void;onOpenOriginal:()=>void}) {
  const tags = buckets.filter(bucket => meta.bucketIds?.includes(bucket.id));
  return <article className="tf-organizer-card">
    <button className="tf-organizer-card-main" onClick={onEditMeta}>
      <div><h3>{item.title}</h3><p><MapPin size={13}/>{meta.region || '지역 미정'} · {item.duration}분</p></div>
      <span>{'★'.repeat(item.priority || 1)}</span>
    </button>
    {tags.length > 0 && <div className="tf-tag-row">{tags.map(tag => <span key={tag.id}>{tag.emoji} {tag.name}</span>)}</div>}
    <button className="tf-original-edit" onClick={onOpenOriginal}>장소 정보 수정·삭제</button>
  </article>;
}

export default function InboxOrganizer() {
  const [host, setHost] = useState<HTMLElement|null>(null);
  const [data, setData] = useState<AppData|null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [meta, setMeta] = useState<MetaMap>({});
  const [view, setView] = useState<ViewMode>('all');
  const [editing, setEditing] = useState<InboxItem|null>(null);
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
      if (!node) {
        node = document.createElement('div');
        node.dataset.tripflowOrganizer = 'true';
        const title = panel.querySelector('.section-title');
        title?.insertAdjacentElement('afterend', node);
      }
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
    let changed = false;
    const next = {...meta};
    items.forEach(item => {
      if (!next[item.id]?.region) {
        next[item.id] = {...next[item.id], region: inferRegion(item, trip.city), bucketIds: next[item.id]?.bucketIds || []};
        changed = true;
      }
    });
    if (changed) { setMeta(next); localStorage.setItem(META_KEY, JSON.stringify(next)); }
  }, [items, trip]);

  const saveMeta = (next:MetaMap) => { setMeta(next); localStorage.setItem(META_KEY, JSON.stringify(next)); };
  const saveBuckets = (next:Bucket[]) => { setBuckets(next); localStorage.setItem(BUCKET_KEY, JSON.stringify(next)); };

  const openOriginal = (item:InboxItem) => {
    const index = items.findIndex(entry => entry.id === item.id);
    const cards = document.querySelectorAll<HTMLElement>('.tf-organized-inbox > .inbox-card');
    cards[index]?.click();
  };

  const groupedRegions = useMemo(() => {
    const groups = new Map<string,InboxItem[]>();
    items.forEach(item => {
      const region = meta[item.id]?.region || (trip ? inferRegion(item, trip.city) : '지역 미정');
      groups.set(region,[...(groups.get(region)||[]),item]);
    });
    return [...groups.entries()].sort((a,b) => a[0].localeCompare(b[0],'ko'));
  }, [items,meta,trip]);

  const addBucket = () => {
    if (!trip || !bucketName.trim()) return;
    saveBuckets([...buckets,{id:crypto.randomUUID(),tripId:trip.id,name:bucketName.trim(),emoji:bucketEmoji||'✨'}]);
    setBucketName(''); setBucketEmoji('✨'); setNewBucket(false);
  };

  if (!host || !data || !trip) return null;

  return createPortal(<>
    <style>{`
      .tf-organized-inbox>.inbox-card,.tf-organized-inbox>.empty{display:none!important}.tf-organizer{margin:14px 0 0}.tf-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#eef2ef;padding:4px;border-radius:14px;margin-bottom:14px}.tf-tabs button{border:0;background:transparent;padding:10px 6px;border-radius:11px;font-weight:800;color:#6a746f}.tf-tabs button.active{background:#fff;color:#17231d;box-shadow:0 3px 10px rgba(23,35,29,.08)}.tf-organizer-list{display:grid;gap:10px}.tf-organizer-card{background:#fff;border:1px solid #e5e9e6;border-radius:17px;padding:14px;box-shadow:0 5px 16px rgba(23,35,29,.04)}.tf-organizer-card-main{width:100%;display:flex;justify-content:space-between;gap:12px;text-align:left;border:0;background:transparent;padding:0}.tf-organizer-card h3{margin:0 0 6px}.tf-organizer-card p{margin:0;color:#66706b;display:flex;align-items:center;gap:4px;font-size:13px}.tf-tag-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.tf-tag-row span{background:#edf4ef;color:#31443a;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:750}.tf-original-edit{margin-top:10px;border:0;background:transparent;color:#78817c;font-size:12px;padding:0;text-decoration:underline}.tf-group{margin-bottom:18px}.tf-group-head{display:flex;justify-content:space-between;align-items:center;margin:0 2px 9px}.tf-group-head h3{margin:0;font-size:17px}.tf-group-head span{font-size:12px;color:#76807b}.tf-bucket-empty{border:1px dashed #cad4cd;border-radius:16px;padding:18px;text-align:center;color:#758079;background:#f8faf8}.tf-add-bucket{width:100%;border:1px dashed #9cac9f;background:#f3f7f4;color:#21392c;border-radius:16px;padding:13px;font-weight:850;display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:12px}.tf-meta-backdrop{position:fixed;inset:0;background:rgba(14,24,19,.48);z-index:110;display:flex;align-items:flex-end;justify-content:center}.tf-meta-sheet{background:#fff;width:min(100%,560px);max-height:88vh;overflow:auto;border-radius:24px 24px 0 0;padding:24px 18px calc(24px + env(safe-area-inset-bottom));position:relative}.tf-meta-close{position:absolute;right:14px;top:14px;border:0;background:#eef2ef;border-radius:999px;width:36px;height:36px;display:grid;place-items:center}.tf-meta-sheet h2{margin:0 44px 6px 0}.tf-meta-sheet label{display:block;margin-top:18px;font-weight:800}.tf-meta-sheet input{width:100%;margin-top:7px}.tf-checks{display:grid;gap:8px;margin-top:8px}.tf-checks button{display:flex;justify-content:space-between;align-items:center;border:1px solid #dfe5e1;background:#fff;border-radius:14px;padding:12px 13px;text-align:left;font-weight:750}.tf-checks button.active{background:#e9f2ec;border-color:#8da598}.tf-meta-save{width:100%;margin-top:20px;border:0;background:#17231d;color:white;border-radius:15px;padding:14px;font-weight:900}.tf-new-bucket{display:grid;grid-template-columns:70px 1fr;gap:8px;margin-bottom:10px}.tf-new-bucket button{grid-column:1/-1}
    `}</style>
    <section className="tf-organizer">
      <div className="tf-tabs">{([['all','전체'],['region','지역'],['bucket','버킷']] as const).map(([key,label])=><button key={key} className={view===key?'active':''} onClick={()=>setView(key)}>{label}</button>)}</div>
      {view === 'all' && <div className="tf-organizer-list">{items.map(item=><Card key={item.id} item={item} meta={meta[item.id]||{region:inferRegion(item,trip.city)}} buckets={tripBuckets} onEditMeta={()=>{setEditing(item);setRegionDraft(meta[item.id]?.region||inferRegion(item,trip.city));}} onOpenOriginal={()=>openOriginal(item)}/>)}{!items.length&&<p className="tf-bucket-empty">아직 Inbox 후보가 없어요.</p>}</div>}
      {view === 'region' && <div>{groupedRegions.map(([region,list])=><section className="tf-group" key={region}><div className="tf-group-head"><h3>📍 {region}</h3><span>{list.length}곳</span></div><div className="tf-organizer-list">{list.map(item=><Card key={item.id} item={item} meta={meta[item.id]||{region}} buckets={tripBuckets} onEditMeta={()=>{setEditing(item);setRegionDraft(region);}} onOpenOriginal={()=>openOriginal(item)}/>)}</div></section>)}</div>}
      {view === 'bucket' && <div><button className="tf-add-bucket" onClick={()=>setNewBucket(v=>!v)}><Plus size={16}/>버킷 먼저 만들기</button>{newBucket&&<div className="tf-new-bucket"><select value={bucketEmoji} onChange={e=>setBucketEmoji(e.target.value)}>{DEFAULT_EMOJIS.map(emoji=><option key={emoji}>{emoji}</option>)}</select><input value={bucketName} onChange={e=>setBucketName(e.target.value)} placeholder="예: 스프카레" onKeyDown={e=>e.key==='Enter'&&addBucket()}/><button className="primary" onClick={addBucket}>버킷 만들기</button></div>}{tripBuckets.map(bucket=>{const list=items.filter(item=>meta[item.id]?.bucketIds?.includes(bucket.id));return <section className="tf-group" key={bucket.id}><div className="tf-group-head"><h3>{bucket.emoji} {bucket.name}</h3><span>{list.length}곳</span></div>{list.length?<div className="tf-organizer-list">{list.map(item=><Card key={item.id} item={item} meta={meta[item.id]||{}} buckets={tripBuckets} onEditMeta={()=>{setEditing(item);setRegionDraft(meta[item.id]?.region||inferRegion(item,trip.city));}} onOpenOriginal={()=>openOriginal(item)}/>)}</div>:<div className="tf-bucket-empty">아직 후보가 없어요.<br/>장소를 찾은 뒤 이 버킷에 넣어주세요.</div>}</section>})}{!tripBuckets.length&&!newBucket&&<div className="tf-bucket-empty"><FolderHeart size={25}/><br/>“스프카레”, “야경”처럼<br/>하고 싶은 것부터 만들어보세요.</div>}</div>}
    </section>
    {editing&&<div className="tf-meta-backdrop" onMouseDown={e=>e.currentTarget===e.target&&setEditing(null)}><div className="tf-meta-sheet"><button className="tf-meta-close" onClick={()=>setEditing(null)}><X size={18}/></button><h2>{editing.title}</h2><p>지역은 자동으로 잡고, 필요할 때만 바꿀 수 있어요.</p><label>지역<input value={regionDraft} onChange={e=>setRegionDraft(e.target.value)} placeholder="예: 스스키노"/></label><label>버킷</label><div className="tf-checks">{tripBuckets.map(bucket=>{const active=meta[editing.id]?.bucketIds?.includes(bucket.id)||false;return <button key={bucket.id} className={active?'active':''} onClick={()=>{const current=meta[editing.id]?.bucketIds||[];const ids=active?current.filter(id=>id!==bucket.id):[...current,bucket.id];saveMeta({...meta,[editing.id]:{...meta[editing.id],region:regionDraft,bucketIds:ids}});}}><span>{bucket.emoji} {bucket.name}</span><b>{active?'✓':'+'}</b></button>})}{!tripBuckets.length&&<p className="tf-bucket-empty">먼저 버킷 탭에서 버킷을 만들어주세요.</p>}</div><button className="tf-meta-save" onClick={()=>{saveMeta({...meta,[editing.id]:{...meta[editing.id],region:regionDraft.trim()||inferRegion(editing,trip.city)}});setEditing(null);}}>저장</button></div></div>}
  </>,host);
}
