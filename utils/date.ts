export function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatLocalDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function datesBetween(first: string, last: string) {
  const dates: string[] = [];
  for (let date = parseLocalDate(first), end = parseLocalDate(last); date <= end; date.setDate(date.getDate() + 1)) dates.push(formatLocalDate(date));
  return dates;
}

export const localToday = () => formatLocalDate(new Date());
