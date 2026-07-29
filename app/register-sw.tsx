'use client';

import { useEffect } from 'react';

const hasLeadingEmoji = (value = '') => /^\s*\p{Extended_Pictographic}/u.test(value);

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

const minutes = (value: string) => {
  const [hour, minute] = value.split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0;
};

const clock = (value: number) => {
  const normalized = ((value % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
};

const setReactInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const labelText = (label: HTMLLabelElement) =>
  Array.from(label.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent || '').join('').trim();

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

    const endLabel = document.createElement('label');
    endLabel.append('종료 시간');
    const endInput = document.createElement('input');
    endInput.type = 'time';
    endInput.setAttribute('aria-label', '종료 시간');
    endLabel.appendChild(endInput);

    const row = document.createElement('div');
    row.className = 'two time-range-row';
    const oldRow = startLabel.parentElement?.classList.contains('two') ? startLabel.parentElement : null;
    const oldRowHasDate = oldRow ? Array.from(oldRow.querySelectorAll('label')).some(label => labelText(label) === '날짜') : false;

    if (oldRow) {
      if (oldRowHasDate) oldRow.insertAdjacentElement('afterend', row);
      else oldRow.insertAdjacentElement('beforebegin', row);
    } else {
      startLabel.insertAdjacentElement('beforebegin', row);
    }
    row.append(startLabel, endLabel);

    if (oldRow && oldRow.children.length === 0) oldRow.remove();

    const syncEnd = () => {
      const duration = Math.max(1, Number(durationInput.value) || 1);
      endInput.value = clock(minutes(startInput.value || '00:00') + duration);
    };

    const syncDuration = () => {
      let difference = minutes(endInput.value) - minutes(startInput.value);
      if (difference <= 0) difference += 1440;
      setReactInputValue(durationInput, String(difference));
    };

    startInput.addEventListener('input', syncEnd);
    startInput.addEventListener('change', syncEnd);
    durationInput.addEventListener('input', syncEnd);
    durationInput.addEventListener('change', syncEnd);
    endInput.addEventListener('input', syncDuration);
    endInput.addEventListener('change', syncDuration);
    syncEnd();
  });
};

export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

    const migrationKey = 'tripflow-place-emoji-migration-v1';
    if (!localStorage.getItem(migrationKey)) {
      try {
        const raw = localStorage.getItem('tripflow-v2');
        if (!raw) {
          localStorage.setItem(migrationKey, 'done');
        } else {
          const data = JSON.parse(raw);
          let changed = false;
          const apply = (item: any) => {
            const shouldApply = item?.source === 'google-maps' || item?.type === 'place';
            if (!shouldApply || !item?.title || hasLeadingEmoji(item.title)) return item;
            changed = true;
            return { ...item, title: `${placeEmoji(item.title, item.placeType)} ${item.title}` };
          };

          const next = {
            ...data,
            inbox: Array.isArray(data.inbox) ? data.inbox.map(apply) : data.inbox,
            schedules: Array.isArray(data.schedules) ? data.schedules.map(apply) : data.schedules,
          };

          if (changed) localStorage.setItem('tripflow-v2', JSON.stringify(next));
          localStorage.setItem(migrationKey, 'done');
          if (changed) window.location.reload();
        }
      } catch {
        localStorage.setItem(migrationKey, 'done');
      }
    }

    enhanceTimeFields();
    const observer = new MutationObserver(enhanceTimeFields);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
