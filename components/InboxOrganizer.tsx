'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronRight, ExternalLink, FolderHeart, MapPin, Pencil, Plus, SlidersHorizontal, X } from 'lucide-react';
import type { AppData, InboxItem } from '@/lib/types';
import { leadingEmoji, placeEmoji, stripLeadingEmoji } from '@/utils/emoji';
import { businessDayForDate, closedDays, datesInRange, descriptionForDate, timeBadge, visitableDates } from '@/lib/businessHours';
import { activeFilterCount, EMPTY_INBOX_FILTERS, matchesInboxFilters, normalizeFilters, type InboxFilters } from '@/lib/inboxFilters';

type Bucket = { id:string; tripId:string; name:string; emoji:string };
type ItemMeta = { region?:string; bucketIds?:string[] };
type MetaMap = Record<string, ItemMeta>;
type ViewMode = 'all'|'region'|'bucket';

const BUCKET_KEY = 'tripflow-buckets-v1';
const META_KEY = 'tripflow-inbox-meta-v1';
const APP_KEY = 'tripflow-v2';
const ICON_KEY = 'tripflow-inbox-icons-v1';
const BUSINESS_INFO_KEY = 'tripflow-inbox-business-info-v1';
const FILTER_KEY = 'tripflow-inbox-filters-v1';
const INBOX_EMOJIS = ['📍','🍽️','☕','🍸','🛍️','🌿','🏛️','🏨','🚉','♨️','🍣','🍜','🍛','🍰','🌃','📷','✨'];
const DEFAULT_EMOJIS = ['🍛','🍜','🍣','☕','🍰','🛍️','♨️','🌃','📷','🌿','✨'];

const readJSON = <T,>(key:string, fallback:T):T => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
};

const firstEmoji = (value:string) => {
  const segmenter = new Intl.Segmenter(undefined,{granularity:'grapheme'});
  const grapheme = segmenter.segment(value.trim())[Symbol.iterator]().next().value?.segment || '';
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3/u.test(grapheme) ? grapheme : '';
};

function normalize(value:string) { return value.toLowerCase().replace(/\s+/g,' '); }
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

function Card({item,icon,region,showBusinessInfo,onIcon,onOpen}:{item:InboxItem;icon:string;region:string;showBusinessInfo:boolean;onIcon:()=>void;onOpen:()=>void}) {
  const closures = closedDays(item.openingHours);
  const badge = timeBadge(item.openingHours,new Date());
  return <article className="tf-organizer-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen();}}}>
    <button className="tf-card-emoji" aria-label={`${item.title} 아이콘 변경`} aria-haspopup="dialog" onKeyDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();onIcon();}}>{icon}</button>
    <div className="tf-card-copy"><h3>{stripLeadingEmoji(item.title)}</h3><p><span>{region}{item.placeType ? ` · ${item.placeType}` : ''}</span>{showBusinessInfo&&(closures.length>0||badge)&&<small>{closures.length>0&&`${closures.join('·')} 휴무`}{closures.length>0&&badge&&' · '}{badge}</small>}</p></div>
  </article>;
}

export default function InboxOrganizer() {
  const [host, setHost] = useState<HTMLElement|null>(null);
  const [data, setData] = useState<AppData|null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [meta, setMeta] = useState<MetaMap>({});
  const [icons, setIcons] = useState<Record<string,string>>({});
  const [showBusinessInfo, setShowBusinessInfo] = useState(true);
  const [iconPicker, setIconPicker] = useState<InboxItem|null>(null);
  const [showCustomIcon, setShowCustomIcon] = useState(false);
  const [view, setView] = useState<ViewMode>('all');
  const [selected, setSelected] = useState<InboxItem|null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [newBucket, setNewBucket] = useState(false);
  const [bucketName, setBucketName] = useState('');
  const [bucketEmoji, setBucketEmoji] = useState('✨');
  const [regionDraft, setRegionDraft] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string|null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<InboxFilters>(EMPTY_INBOX_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [newRegionMode, setNewRegionMode] = useState(false);

  useEffect(() => {
    let lastRaw = '';
    const sync = () => {
      const raw = localStorage.getItem(APP_KEY) || '';
      if (raw !== lastRaw) { lastRaw = raw; setData(readJSON<AppData|null>(APP_KEY, null)); }
      setBuckets(readJSON<Bucket[]>(BUCKET_KEY, []));
      setMeta(readJSON<MetaMap>(META_KEY, {}));
      setIcons(readJSON<Record<string,string>>(ICON_KEY, {}));
      setShowBusinessInfo(localStorage.getItem(BUSINESS_INFO_KEY) !== 'false');
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

  useEffect(() => { setFilters(normalizeFilters(readJSON<Partial<InboxFilters>>(FILTER_KEY,EMPTY_INBOX_FILTERS))); }, []);

  const trip = data?.trips.find(t => t.id === data.activeTripId) || data?.trips[0];
  const items = useMemo(() => data && trip ? data.inbox.filter(item => item.tripId === trip.id) : [], [data, trip]);
  const tripBuckets = useMemo(() => trip ? buckets.filter(bucket => bucket.tripId === trip.id) : [], [buckets, trip]);
  const regionFor = (item:InboxItem) => meta[item.id]?.region || (trip ? inferRegion(item,trip.city) : '지역 미정');
  const iconFor = (item:InboxItem) => icons[item.id]||leadingEmoji(item.title)||placeEmoji(item.title,item.placeType);
  const availableRegions = useMemo(() => [...new Set(items.map(regionFor))].sort((a,b)=>a==='지역 미정'?1:b==='지역 미정'?-1:a.localeCompare(b,'ko')), [items,meta,trip]);
  const placeTypes = useMemo(() => [...new Set(items.map(item=>item.placeType).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b,'ko')), [items]);
  const filteredItems = useMemo(() => {
    const now = new Date();
    return items.filter(item=>matchesInboxFilters(item,regionFor(item),query.trim(),filters,now));
  }, [items,meta,trip,query,filters]);

  useEffect(() => {
    if (!trip || !items.length) return;
    let changed = false; const next = {...meta};
    items.forEach(item => { if (!next[item.id]?.region) { next[item.id] = {...next[item.id],region:inferRegion(item,trip.city),bucketIds:next[item.id]?.bucketIds||[]}; changed = true; } });
    if (changed) { setMeta(next); localStorage.setItem(META_KEY,JSON.stringify(next)); }
  }, [items,trip]);

  const saveMeta = (next:MetaMap) => { setMeta(next); localStorage.setItem(META_KEY,JSON.stringify(next)); };
  const saveFilters = (next:InboxFilters) => { setFilters(next); localStorage.setItem(FILTER_KEY,JSON.stringify(next)); };
  const toggleFilter = (key:'placeTypes'|'timeBands'|'statuses'|'regions',value:string) => {
    const current = filters[key] as string[];
    saveFilters({...filters,[key]:current.includes(value)?current.filter(entry=>entry!==value):[...current,value]});
  };
  const assignRegion = (item:InboxItem,value:string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const canonical = availableRegions.find(region=>region.toLocaleLowerCase()===trimmed.toLocaleLowerCase()) || trimmed;
    saveMeta({...meta,[item.id]:{...meta[item.id],region:canonical,bucketIds:meta[item.id]?.bucketIds||[]}});
    setRegionDraft(canonical); setNewRegionMode(false);
  };
  const saveBuckets = (next:Bucket[]) => { setBuckets(next); localStorage.setItem(BUCKET_KEY,JSON.stringify(next)); };
  const saveIcon = (item:InboxItem, icon?:string) => {
    const next = {...icons};
    if (icon) next[item.id] = icon; else delete next[item.id];
    setIcons(next); localStorage.setItem(ICON_KEY,JSON.stringify(next)); setIconPicker(null); setShowCustomIcon(false);
  };
  const card = (item:InboxItem) => <Card key={item.id} item={item} icon={iconFor(item)} region={regionFor(item)} showBusinessInfo={showBusinessInfo} onIcon={()=>{setIconPicker(item);setShowCustomIcon(false);}} onOpen={()=>openDetail(item)}/>;
  const openOriginal = (item:InboxItem) => {
    const index = items.findIndex(entry => entry.id === item.id);
    const cards = document.querySelectorAll<HTMLElement>('.tf-organized-inbox > .inbox-card');
    setSelected(null); setEditingMeta(false); cards[index]?.click();
  };
  const openDetail = (item:InboxItem) => { setSelected(item); setEditingMeta(false); setNewRegionMode(false); setRegionDraft(regionFor(item)); };

  const groupedRegions = useMemo(() => {
    const groups = new Map<string,InboxItem[]>();
    filteredItems.forEach(item => { const region = regionFor(item); groups.set(region,[...(groups.get(region)||[]),item]); });
    return [...groups.entries()].sort((a,b) => a[0].localeCompare(b[0],'ko'));
  }, [filteredItems,meta,trip]);
  const regionItems = useMemo(() => selectedRegion ? filteredItems.filter(item=>regionFor(item)===selectedRegion).sort((a,b)=>iconFor(a).localeCompare(iconFor(b))||stripLeadingEmoji(a.title).localeCompare(stripLeadingEmoji(b.title),'ko')) : [], [selectedRegion,filteredItems,meta,icons,trip]);

  const addBucket = () => {
    if (!trip || !bucketName.trim()) return;
    saveBuckets([...buckets,{id:crypto.randomUUID(),tripId:trip.id,name:bucketName.trim(),emoji:bucketEmoji||'✨'}]);
    setBucketName(''); setBucketEmoji('✨'); setNewBucket(false);
  };

  if (!host || !data || !trip) return null;
  const todayHours = selected ? descriptionForDate(selected.openingHours,new Date()) : '';
  const selectedTags = selected ? tripBuckets.filter(bucket => meta[selected.id]?.bucketIds?.includes(bucket.id)) : [];
  const tripDates = datesInRange(trip.startDate,trip.endDate);
  const availableDates = selected ? visitableDates(selected.openingHours,trip.startDate,trip.endDate) : [];
  const hasCompleteTripHours = Boolean(selected&&tripDates.length&&tripDates.every(date=>businessDayForDate(selected.openingHours,date)));

  return createPortal(<>
    <style>{`
      .tf-organized-inbox>.inbox-card,.tf-organized-inbox>.empty{display:none!important}.tf-organizer{margin:14px 0 0}.tf-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#eef2ef;padding:4px;border-radius:14px;margin-bottom:14px}.tf-tabs button{border:0;background:transparent;padding:10px 6px;border-radius:11px;font-weight:800;color:#6a746f}.tf-tabs button.active{background:#fff;color:#17231d;box-shadow:0 3px 10px rgba(23,35,29,.08)}.tf-organizer-list{display:grid;gap:9px}.tf-organizer-card{width:100%;background:#fff;border:1px solid #e5e9e6;border-radius:15px;padding:12px 16px;text-align:left;box-shadow:0 4px 13px rgba(23,35,29,.035);display:flex;align-items:center;gap:12px;cursor:pointer}.tf-organizer-card h3{margin:0;font-size:16px;color:#1d3026}.tf-card-emoji{width:38px;height:38px;flex:0 0 38px;border:0;border-radius:9px;background:transparent;font-size:25px;display:grid;place-items:center;padding:0}.tf-card-emoji:hover,.tf-card-emoji:focus-visible{background:#eef2ef;outline:none}.tf-icon-backdrop{position:fixed;inset:0;z-index:130}.tf-icon-picker{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(310px,calc(100% - 32px));background:#fff;border:1px solid #e1e6e2;border-radius:14px;padding:10px;box-shadow:0 18px 50px rgba(23,35,29,.2)}.tf-icon-picker p{margin:2px 4px 9px;font-size:12px;font-weight:800;color:#758079}.tf-icon-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}.tf-icon-grid button{border:0;background:transparent;border-radius:8px;min-height:38px;font-size:22px}.tf-icon-grid button:hover,.tf-icon-grid button:focus-visible{background:#eef2ef;outline:none}.tf-icon-auto,.tf-icon-custom{grid-column:1/-1!important;font-size:13px!important;text-align:left;padding:8px 10px;font-weight:800;color:#31443a}.tf-custom-icon-input{grid-column:1/-1;width:100%;font-size:24px;text-align:center;padding:9px;border:1px solid #cad4cd;border-radius:10px}.tf-group{margin-bottom:18px}.tf-group-head{display:flex;justify-content:space-between;align-items:center;margin:0 2px 9px}.tf-group-head h3{margin:0;font-size:17px}.tf-group-head span{font-size:12px;color:#76807b}.tf-bucket-empty{border:1px dashed #cad4cd;border-radius:16px;padding:18px;text-align:center;color:#758079;background:#f8faf8}.tf-add-bucket{width:100%;border:1px dashed #9cac9f;background:#f3f7f4;color:#21392c;border-radius:16px;padding:13px;font-weight:850;display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:12px}.tf-new-bucket{display:grid;grid-template-columns:70px 1fr;gap:8px;margin-bottom:10px}.tf-new-bucket button{grid-column:1/-1}.tf-detail-backdrop{position:fixed;inset:0;background:rgba(14,24,19,.48);z-index:120;display:flex;align-items:flex-end;justify-content:center}.tf-detail-sheet{background:#fff;width:min(100%,560px);max-height:88vh;overflow:auto;border-radius:24px 24px 0 0;padding:25px 19px calc(25px + env(safe-area-inset-bottom));position:relative}.tf-detail-close{position:absolute;right:14px;top:14px;border:0;background:#eef2ef;border-radius:999px;width:36px;height:36px;display:grid;place-items:center}.tf-detail-sheet h2{margin:0 46px 20px 0;font-size:25px}.tf-detail-row{padding:14px 0;border-top:1px solid #edf0ee}.tf-detail-row b{display:block;font-size:12px;color:#78827d;margin-bottom:7px}.tf-detail-row p{margin:0;line-height:1.55;color:#24372d}.tf-map-link{display:flex;align-items:center;justify-content:space-between;text-decoration:none;color:#183d2a;font-weight:850;background:#eff5f1;padding:13px 14px;border-radius:14px}.tf-week-hours{margin-top:7px}.tf-week-hours summary{font-weight:850;cursor:pointer}.tf-week-list{margin-top:10px;background:#f6f8f6;border-radius:13px;padding:10px 12px}.tf-week-list p{font-size:13px;margin:5px 0}.tf-tag-row{display:flex;flex-wrap:wrap;gap:6px}.tf-tag-row span{background:#edf4ef;color:#31443a;border-radius:999px;padding:6px 9px;font-size:12px;font-weight:750}.tf-detail-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px}.tf-detail-actions button{border:0;border-radius:14px;padding:14px;font-weight:900}.tf-meta-button{background:#edf3ef;color:#24372d}.tf-edit-button{background:#17231d;color:#fff;display:flex;align-items:center;justify-content:center;gap:7px}.tf-meta-editor label{display:block;margin-top:16px;font-weight:800}.tf-meta-editor input{width:100%;margin-top:7px}.tf-checks{display:grid;gap:8px;margin-top:8px}.tf-checks button{display:flex;justify-content:space-between;align-items:center;border:1px solid #dfe5e1;background:#fff;border-radius:14px;padding:12px 13px;text-align:left;font-weight:750}.tf-checks button.active{background:#e9f2ec;border-color:#8da598}.tf-meta-save{width:100%;margin-top:20px;border:0;background:#17231d;color:white;border-radius:15px;padding:14px;font-weight:900}
      .tf-business-toggle{display:flex;align-items:center;justify-content:flex-end;gap:7px;margin:-2px 2px 9px;font-size:11px;color:#76807b}.tf-business-toggle input{width:auto;margin:0}.tf-organizer-card{padding:10px 16px}.tf-card-copy{min-width:0;flex:1}.tf-card-copy p{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:3px 0 0;font-size:11px;color:#87918b}.tf-card-copy p span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tf-card-copy small{flex:none;font-size:10.5px;color:#8b938e}.tf-available-dates{margin-top:8px!important;font-size:11px!important;color:#78827d!important}.tf-available-dates.warning{color:#b23a32!important;font-weight:800}
      .tf-search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-bottom:9px}.tf-search-row input{min-width:0;border:1px solid #dfe5e1;border-radius:13px;background:#fff;padding:11px 12px}.tf-filter-button{position:relative;border:1px solid #dfe5e1;background:#fff;border-radius:13px;padding:0 13px;display:flex;align-items:center;gap:6px;font-weight:800;color:#31443a}.tf-filter-count{min-width:18px;height:18px;border-radius:9px;background:#20382b;color:#fff;display:grid;place-items:center;font-size:10px}.tf-region-folders{display:grid;gap:9px}.tf-region-folder{width:100%;border:1px solid #e0e6e2;background:#fff;border-radius:15px;padding:16px;text-align:left;display:flex;align-items:center;justify-content:space-between;color:#21372b}.tf-region-folder span{font-weight:850}.tf-region-folder small{color:#7a857f;margin-left:5px}.tf-region-back{border:0;background:transparent;padding:4px 0 12px;display:flex;align-items:center;gap:6px;font-weight:850;color:#405448}.tf-filter-backdrop{position:fixed;inset:0;background:rgba(14,24,19,.42);z-index:135;display:flex;align-items:flex-end;justify-content:center}.tf-filter-sheet{width:min(100%,560px);max-height:82vh;overflow:auto;background:#fff;border-radius:24px 24px 0 0;padding:22px 18px calc(22px + env(safe-area-inset-bottom))}.tf-filter-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.tf-filter-head h2{margin:0}.tf-filter-head button{border:0;background:transparent;color:#68756e;font-weight:800}.tf-filter-group{padding:13px 0;border-top:1px solid #edf0ee}.tf-filter-group b{display:block;font-size:13px;margin-bottom:9px}.tf-filter-options{display:flex;flex-wrap:wrap;gap:7px}.tf-filter-chip{border:1px solid #dfe5e1;background:#fff;border-radius:999px;padding:8px 11px;font-size:12px;color:#536159}.tf-filter-chip.active{background:#20382b;border-color:#20382b;color:#fff}.tf-filter-done{width:100%;border:0;border-radius:14px;background:#17231d;color:#fff;padding:13px;font-weight:900;margin-top:10px}.tf-region-options{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.tf-region-options button{border:1px solid #dfe5e1;background:#fff;border-radius:12px;padding:10px;text-align:left}.tf-region-options button.active{background:#e9f2ec;border-color:#8da598;font-weight:850}.tf-new-region-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-top:8px}.tf-new-region-row input{margin:0!important}.tf-new-region-row button{border:0;border-radius:12px;background:#17231d;color:#fff;padding:0 13px;font-weight:850}
    `}</style>
    <section className="tf-organizer">
      <div className="tf-search-row"><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Inbox 장소 검색" aria-label="Inbox 장소 검색"/><button className="tf-filter-button" onClick={()=>setFilterOpen(true)}><SlidersHorizontal size={16}/>필터{activeFilterCount(filters)>0&&<span className="tf-filter-count">{activeFilterCount(filters)}</span>}</button></div>
      <label className="tf-business-toggle"><span>영업정보 표시</span><input type="checkbox" checked={showBusinessInfo} onChange={event=>{setShowBusinessInfo(event.target.checked);localStorage.setItem(BUSINESS_INFO_KEY,String(event.target.checked));}}/></label>
      <div className="tf-tabs">{([['all','전체'],['region','지역'],['bucket','버킷']] as const).map(([key,label])=><button key={key} className={view===key?'active':''} onClick={()=>{setView(key);setSelectedRegion(null);}}>{label}</button>)}</div>
      {view==='all'&&<div className="tf-organizer-list">{filteredItems.map(card)}{!filteredItems.length&&<p className="tf-bucket-empty">조건에 맞는 Inbox 장소가 없어요.</p>}</div>}
      {view==='region'&&<div>{selectedRegion?<><button className="tf-region-back" onClick={()=>setSelectedRegion(null)}><ArrowLeft size={16}/>전체 지역</button><div className="tf-group-head"><h3>{selectedRegion}</h3><span>{regionItems.length}곳</span></div><div className="tf-organizer-list">{regionItems.map(card)}{!regionItems.length&&<p className="tf-bucket-empty">조건에 맞는 Inbox 장소가 없어요.</p>}</div></>:<div className="tf-region-folders">{groupedRegions.map(([region,list])=><button className="tf-region-folder" key={region} onClick={()=>setSelectedRegion(region)}><span>{region}<small>· {list.length}곳</small></span><ChevronRight size={17}/></button>)}{!groupedRegions.length&&<p className="tf-bucket-empty">조건에 맞는 지역이 없어요.</p>}</div>}</div>}
      {view==='bucket'&&<div><button className="tf-add-bucket" onClick={()=>setNewBucket(v=>!v)}><Plus size={16}/>버킷 먼저 만들기</button>{newBucket&&<div className="tf-new-bucket"><select value={bucketEmoji} onChange={e=>setBucketEmoji(e.target.value)}>{DEFAULT_EMOJIS.map(emoji=><option key={emoji}>{emoji}</option>)}</select><input value={bucketName} onChange={e=>setBucketName(e.target.value)} placeholder="예: 스프카레" onKeyDown={e=>e.key==='Enter'&&addBucket()}/><button className="primary" onClick={addBucket}>버킷 만들기</button></div>}{tripBuckets.map(bucket=>{const list=filteredItems.filter(item=>meta[item.id]?.bucketIds?.includes(bucket.id));return <section className="tf-group" key={bucket.id}><div className="tf-group-head"><h3>{bucket.emoji} {bucket.name}</h3><span>{list.length}곳</span></div>{list.length?<div className="tf-organizer-list">{list.map(card)}</div>:<div className="tf-bucket-empty">조건에 맞는 후보가 없어요.</div>}</section>})}{!tripBuckets.length&&!newBucket&&<div className="tf-bucket-empty"><FolderHeart size={25}/><br/>“스프카레”, “야경”처럼<br/>하고 싶은 것부터 만들어보세요.</div>}</div>}
    </section>
    {filterOpen&&<div className="tf-filter-backdrop" onMouseDown={event=>event.currentTarget===event.target&&setFilterOpen(false)}><div className="tf-filter-sheet"><div className="tf-filter-head"><h2>Inbox 필터</h2><button onClick={()=>saveFilters(EMPTY_INBOX_FILTERS)}>초기화</button></div><div className="tf-filter-group"><b>장소 타입</b><div className="tf-filter-options">{placeTypes.map(type=><button className={`tf-filter-chip ${filters.placeTypes.includes(type)?'active':''}`} key={type} onClick={()=>toggleFilter('placeTypes',type)}>{type}</button>)}</div></div><div className="tf-filter-group"><b>시간대 배지</b><div className="tf-filter-options">{([['day','낮'],['evening','저녁'],['late','늦게까지']] as const).map(([value,label])=><button className={`tf-filter-chip ${filters.timeBands.includes(value)?'active':''}`} key={value} onClick={()=>toggleFilter('timeBands',value)}>{label}</button>)}</div></div><div className="tf-filter-group"><b>휴무 여부</b><div className="tf-filter-options">{([['any','전체'],['has','정기 휴무 있음'],['none','정기 휴무 없음']] as const).map(([value,label])=><button className={`tf-filter-chip ${filters.closure===value?'active':''}`} key={value} onClick={()=>saveFilters({...filters,closure:value})}>{label}</button>)}</div></div><div className="tf-filter-group"><b>현재 영업 상태</b><div className="tf-filter-options">{([['open','영업 중'],['soon','마감 임박'],['closed','마감']] as const).map(([value,label])=><button className={`tf-filter-chip ${filters.statuses.includes(value)?'active':''}`} key={value} onClick={()=>toggleFilter('statuses',value)}>{label}</button>)}</div></div><div className="tf-filter-group"><b>지역</b><div className="tf-filter-options">{availableRegions.map(region=><button className={`tf-filter-chip ${filters.regions.includes(region)?'active':''}`} key={region} onClick={()=>toggleFilter('regions',region)}>{region}</button>)}</div></div><button className="tf-filter-done" onClick={()=>setFilterOpen(false)}>적용 결과 보기</button></div></div>}
    {iconPicker&&<div className="tf-icon-backdrop" onMouseDown={event=>event.currentTarget===event.target&&setIconPicker(null)}><div className="tf-icon-picker" role="dialog" aria-label={`${iconPicker.title} 아이콘 선택`}><p>아이콘 선택</p><div className="tf-icon-grid"><button className="tf-icon-auto" onClick={()=>saveIcon(iconPicker)}>Auto · {placeEmoji(iconPicker.title,iconPicker.placeType)}</button>{INBOX_EMOJIS.map(emoji=><button key={emoji} aria-label={`${emoji} 선택`} onClick={()=>saveIcon(iconPicker,emoji)}>{emoji}</button>)}<button className="tf-icon-custom" onClick={()=>setShowCustomIcon(true)}>＋ 직접 입력</button>{showCustomIcon&&<input className="tf-custom-icon-input" autoFocus inputMode="text" enterKeyHint="done" aria-label="직접 입력할 이모지" placeholder="이모지 1개" onChange={event=>{const emoji=firstEmoji(event.target.value);if(emoji)saveIcon(iconPicker,emoji);}}/>}</div></div></div>}
    {selected&&<div className="tf-detail-backdrop" onMouseDown={e=>e.currentTarget===e.target&&setSelected(null)}><div className="tf-detail-sheet"><button className="tf-detail-close" onClick={()=>setSelected(null)}><X size={18}/></button>{!editingMeta?<><h2>{selected.title}</h2>{selected.address&&<div className="tf-detail-row"><b>주소</b><p><MapPin size={14}/> {selected.address}</p></div>}<div className="tf-detail-row"><b>타입</b><p>{selected.placeType || '타입 정보 없음'}</p></div>{selected.mapUrl&&<div className="tf-detail-row"><a className="tf-map-link" href={selected.mapUrl} target="_blank" rel="noreferrer"><span>Google Maps에서 보기</span><ExternalLink size={17}/></a></div>}<div className="tf-detail-row"><b>오늘 영업시간</b><p>{todayHours ? timePart(todayHours) : '영업시간 정보 없음'}</p>{hasCompleteTripHours&&(availableDates.length?<p className="tf-available-dates">가능한 날짜: {availableDates.map(date=>`${date.getMonth()+1}/${date.getDate()}`).join(' · ')}</p>:<p className="tf-available-dates warning">⚠️ 여행 기간 중 방문 가능한 날짜 없음</p>)}{selected.openingHours?.length&&<details className="tf-week-hours"><summary>요일별 영업시간</summary><div className="tf-week-list">{selected.openingHours.map(line=><p key={line}>{line}</p>)}</div></details>}</div>{selectedTags.length>0&&<div className="tf-detail-row"><b>버킷</b><div className="tf-tag-row">{selectedTags.map(tag=><span key={tag.id}>{tag.emoji} {tag.name}</span>)}</div></div>}<div className="tf-detail-actions"><button className="tf-meta-button" onClick={()=>setEditingMeta(true)}>지역·버킷</button><button className="tf-edit-button" onClick={()=>openOriginal(selected)}><Pencil size={16}/>수정</button></div></>:<div className="tf-meta-editor"><h2>지역·버킷 수정</h2><label>지역</label><div className="tf-region-options">{availableRegions.map(region=><button key={region} className={regionDraft===region?'active':''} onClick={()=>assignRegion(selected,region)}>{region}</button>)}<button onClick={()=>{setNewRegionMode(true);setRegionDraft('');}}>＋ 새 지역 추가</button></div>{newRegionMode&&<div className="tf-new-region-row"><input autoFocus value={regionDraft} onChange={event=>setRegionDraft(event.target.value)} placeholder="새 지역명" onKeyDown={event=>event.key==='Enter'&&assignRegion(selected,regionDraft)}/><button disabled={!regionDraft.trim()} onClick={()=>assignRegion(selected,regionDraft)}>추가</button></div>}<label>버킷</label><div className="tf-checks">{tripBuckets.map(bucket=>{const active=meta[selected.id]?.bucketIds?.includes(bucket.id)||false;return <button key={bucket.id} className={active?'active':''} onClick={()=>{const current=meta[selected.id]?.bucketIds||[];const ids=active?current.filter(id=>id!==bucket.id):[...current,bucket.id];saveMeta({...meta,[selected.id]:{...meta[selected.id],region:regionFor(selected),bucketIds:ids}});}}><span>{bucket.emoji} {bucket.name}</span><b>{active?'✓':'+'}</b></button>})}{!tripBuckets.length&&<p className="tf-bucket-empty">먼저 버킷 탭에서 버킷을 만들어주세요.</p>}</div><button className="tf-meta-save" onClick={()=>setEditingMeta(false)}>완료</button></div>}</div></div>}
  </>,host);
}
