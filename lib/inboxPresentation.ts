import type { InboxItem, Schedule } from '@/lib/types';
import { leadingEmoji, placeEmoji, stripLeadingEmoji } from '@/utils/emoji';

export type InboxItemMeta = { region?:string; bucketIds?:string[]; favorite?:boolean; note?:string };
export type InboxMetaMap = Record<string,InboxItemMeta>;
export type InboxIconMap = Record<string,string>;

export const INBOX_META_KEY = 'tripflow-inbox-meta-v1';
export const INBOX_ICON_KEY = 'tripflow-inbox-icons-v1';

function normalize(value:string) {
  return value.toLocaleLowerCase().replace(/\s+/g,' ').trim();
}

export function inferInboxRegion(item:Pick<InboxItem,'title'|'address'>,city:string) {
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

export function inboxRegion(item:Pick<InboxItem,'id'|'title'|'address'>,city:string,meta:InboxMetaMap) {
  return meta[item.id]?.region?.trim() || inferInboxRegion(item,city);
}

function matchingInbox(item:Pick<Schedule,'id'|'title'|'address'>,inbox:InboxItem[]) {
  const title = normalize(stripLeadingEmoji(item.title));
  const address = normalize(item.address || '');
  const sameTitle = inbox.filter(candidate => normalize(stripLeadingEmoji(candidate.title)) === title);
  return inbox.find(candidate => candidate.id === item.id)
    || sameTitle.find(candidate => !address || !candidate.address || normalize(candidate.address) === address)
    || (sameTitle.length === 1 ? sameTitle[0] : undefined);
}

export function isInboxItemPlaced(item:Pick<InboxItem,'id'|'title'|'address'>,schedules:Schedule[]) {
  const title = normalize(stripLeadingEmoji(item.title));
  const address = normalize(item.address || '');
  return schedules.some(schedule => {
    if (schedule.id === item.id) return true;
    if (normalize(stripLeadingEmoji(schedule.title)) !== title) return false;
    const scheduleAddress = normalize(schedule.address || '');
    return !address || !scheduleAddress || address === scheduleAddress;
  });
}

export function inboxPlaceIcon(
  item:Pick<InboxItem,'id'|'title'|'placeType'|'address'>|Pick<Schedule,'id'|'title'|'placeType'|'address'>,
  icons:InboxIconMap,
  inbox:InboxItem[] = [],
) {
  const source = matchingInbox(item,inbox);
  return icons[item.id] || (source ? icons[source.id] : '') || leadingEmoji(item.title)
    || placeEmoji(item.title,item.placeType);
}
