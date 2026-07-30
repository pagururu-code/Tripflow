import type { InboxItem } from '@/lib/types';
import { businessDayForDate, closedDays, timeBadge } from '@/lib/businessHours';

export type BusinessStatus = 'open'|'soon'|'closed';
export type TimeBand = 'day'|'evening'|'late';
export type InboxFilters = {
  placeTypes:string[];
  timeBands:TimeBand[];
  closure:'any'|'has'|'none';
  statuses:BusinessStatus[];
  regions:string[];
  placement:'all'|'unplaced'|'placed';
};

export const EMPTY_INBOX_FILTERS:InboxFilters = {
  placeTypes:[], timeBands:[], closure:'any', statuses:[], regions:[], placement:'all',
};

export function normalizeFilters(value:Partial<InboxFilters>|null|undefined):InboxFilters {
  const list = <T extends string>(input:unknown) => Array.isArray(input) ? input.filter((entry):entry is T => typeof entry === 'string') : [];
  return {
    placeTypes:list(value?.placeTypes),
    timeBands:list<TimeBand>(value?.timeBands),
    closure:value?.closure === 'has' || value?.closure === 'none' ? value.closure : 'any',
    statuses:list<BusinessStatus>(value?.statuses),
    regions:list(value?.regions),
    placement:value?.placement === 'unplaced' || value?.placement === 'placed' ? value.placement : 'all',
  };
}

export function activeFilterCount(filters:InboxFilters) {
  return filters.placeTypes.length + filters.timeBands.length + filters.statuses.length
    + filters.regions.length + (filters.closure === 'any' ? 0 : 1) + (filters.placement === 'all' ? 0 : 1);
}

export function businessStatus(item:InboxItem, now:Date):BusinessStatus|'' {
  const hours = businessDayForDate(item.openingHours,now);
  if (!hours) return '';
  if (hours.closed) return 'closed';
  if (hours.allDay) return 'open';
  const minutes = now.getHours()*60+now.getMinutes();
  const interval = hours.intervals.find(([open,close]) => minutes >= open && minutes < close);
  if (interval) return interval[1]-minutes <= 60 ? 'soon' : 'open';
  const finalClose = Math.max(...hours.intervals.map(([,close]) => close));
  return Number.isFinite(finalClose) && minutes >= finalClose ? 'closed' : '';
}

export function timeBand(item:InboxItem, now:Date):TimeBand|'' {
  const badge = timeBadge(item.openingHours,now);
  if (badge === '☀️') return 'day';
  if (badge === '🌆') return 'evening';
  if (badge.startsWith('🌙')) return 'late';
  return '';
}

export function matchesInboxFilters(item:InboxItem, region:string, query:string, filters:InboxFilters, now:Date,placed=false) {
  const searchable = `${item.title} ${item.address || ''} ${item.placeType || ''} ${region}`.toLocaleLowerCase();
  if (query && !searchable.includes(query.toLocaleLowerCase())) return false;
  if (filters.placeTypes.length && (!item.placeType || !filters.placeTypes.includes(item.placeType))) return false;
  if (filters.regions.length && !filters.regions.includes(region)) return false;
  if (filters.placement === 'placed' && !placed) return false;
  if (filters.placement === 'unplaced' && placed) return false;
  const band = timeBand(item,now);
  if (filters.timeBands.length && (!band || !filters.timeBands.includes(band))) return false;
  const status = businessStatus(item,now);
  if (filters.statuses.length && (!status || !filters.statuses.includes(status))) return false;
  const closures = closedDays(item.openingHours);
  if (filters.closure === 'has' && !closures.length) return false;
  if (filters.closure === 'none' && (!item.openingHours?.length || closures.length)) return false;
  return true;
}
