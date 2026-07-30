const CLOSED_PATTERN = /(휴무|영업하지 않음|closed)/i;
const ALL_DAY_PATTERN = /(24\s*시간|24\s*hours|open\s*24)/i;
const DAY_LABELS = ['월','화','수','목','금','토','일'] as const;
const DAY_ALIASES = [
  /^(월요일|월|monday|mon)(?:\s|:)/i, /^(화요일|화|tuesday|tue)(?:\s|:)/i,
  /^(수요일|수|wednesday|wed)(?:\s|:)/i, /^(목요일|목|thursday|thu)(?:\s|:)/i,
  /^(금요일|금|friday|fri)(?:\s|:)/i, /^(토요일|토|saturday|sat)(?:\s|:)/i,
  /^(일요일|일|sunday|sun)(?:\s|:)/i,
];

export type BusinessHoursDay = { description:string; closed:boolean; allDay:boolean; intervals:[number,number][] };

export function localDate(value:string) {
  const [year,month,day] = value.split('-').map(Number);
  return new Date(year,month-1,day,12);
}

export function mondayIndex(date:Date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

function descriptionIndex(description:string) {
  return DAY_ALIASES.findIndex(pattern => pattern.test(description.trim()));
}

export function descriptionForDate(openingHours:string[]|undefined,date:Date) {
  if (!openingHours?.length) return '';
  const target = mondayIndex(date);
  return openingHours.find(line => descriptionIndex(line) === target)
    || (openingHours.length === 7 ? openingHours[target] || '' : '');
}

export function parseClock(token:string) {
  const match = token.replace(/\s+/g,' ').trim().match(/(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})/i);
  if (!match) return null;
  let hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) return null;
  const marker = (match[1] || '').toUpperCase();
  if ((marker === '오후' || marker === 'PM') && hour < 12) hour += 12;
  if ((marker === '오전' || marker === 'AM') && hour === 12) hour = 0;
  return hour * 60 + minute;
}

export function parseBusinessDay(description:string):BusinessHoursDay|null {
  if (!description.trim()) return null;
  if (CLOSED_PATTERN.test(description)) return {description,closed:true,allDay:false,intervals:[]};
  if (ALL_DAY_PATTERN.test(description)) return {description,closed:false,allDay:true,intervals:[[0,1440]]};
  const clocks = [...description.matchAll(/(?:오전|오후|AM|PM)?\s*\d{1,2}:\d{2}/gi)]
    .map(match => parseClock(match[0])).filter((value):value is number => value !== null);
  if (!clocks.length || clocks.length % 2 !== 0) return null;
  const intervals:[number,number][] = [];
  for (let index=0;index<clocks.length;index+=2) {
    const open = clocks[index];
    let close = clocks[index+1];
    if (close <= open) close += 1440;
    intervals.push([open,close]);
  }
  return {description,closed:false,allDay:false,intervals};
}

export function businessDayForDate(openingHours:string[]|undefined,date:Date) {
  const description = descriptionForDate(openingHours,date);
  return description ? parseBusinessDay(description) : null;
}

export function closedDays(openingHours:string[]|undefined) {
  if (!openingHours?.length) return [] as string[];
  const closed = new Set<number>();
  openingHours.forEach((line,index) => {
    if (!CLOSED_PATTERN.test(line)) return;
    const labeledIndex = descriptionIndex(line);
    if (labeledIndex >= 0) closed.add(labeledIndex);
    else if (openingHours.length === 7) closed.add(index);
  });
  return DAY_LABELS.filter((_,index) => closed.has(index));
}

export function timeBadge(openingHours:string[]|undefined,date:Date) {
  const hours = businessDayForDate(openingHours,date);
  if (!hours || hours.closed) return '';
  if (hours.allDay) return '🌙 24h';
  const close = Math.max(...hours.intervals.map(([,end]) => end));
  if (!Number.isFinite(close)) return '';
  if (close < 18*60) return '☀️';
  if (close < 22*60) return '🌆';
  return '🌙';
}

export function datesInRange(start:string,end:string) {
  const output:Date[] = [], cursor = localDate(start), last = localDate(end);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime()) || cursor > last) return output;
  while (cursor <= last) { output.push(new Date(cursor)); cursor.setDate(cursor.getDate()+1); }
  return output;
}

export function visitableDates(openingHours:string[]|undefined,start:string,end:string) {
  return datesInRange(start,end).filter(date => {
    const hours = businessDayForDate(openingHours,date);
    return hours !== null && !hours.closed && (hours.allDay || hours.intervals.length > 0);
  });
}

export function closingWarning(openingHours:string[]|undefined,date:string,start:string) {
  if (!date || !start) return '';
  const startMinutes = parseClock(start);
  if (startMinutes === null) return '';
  const hours = businessDayForDate(openingHours,localDate(date));
  if (!hours) return '';
  if (hours.closed) return '🔴 오늘 휴무';
  if (hours.allDay) return '';
  const containing = hours.intervals.find(([open,close]) => startMinutes >= open && startMinutes <= close);
  const close = containing?.[1] ?? Math.max(...hours.intervals.map(([,end]) => end));
  if (!Number.isFinite(close)) return '';
  if (startMinutes >= close) return '🔴 마감';
  if (containing && close-startMinutes <= 60) return '🟠 곧 마감';
  return '';
}
