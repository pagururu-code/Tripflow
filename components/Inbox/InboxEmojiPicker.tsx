'use client';

import { useEffect } from 'react';

const ICONS = [
  '📍','🍽️','☕','🍰','🍜','🍣','🥐','🍺','🍸','🛍️',
  '🏬','🎁','🌿','🌸','🏛️','🏯','⛩️','🎡','📸','♨️',
  '🏨','🚉','✈️','🚆','🚌','🚕','🚶','🌊','🌙','⭐',
];

const ICONS_KEY = 'tripflow-inbox-icons-v1';

const cleanTitle = (value = '') => value
  .replace(/^\s*\p{Extended_Pictographic}(?:\uFE0F)?\s*/u, '')
  .trim();

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

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
};

export default function InboxEmojiPicker() {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .tf-inbox-icon-button{width:38px;height:38px;flex:0 0 38px;border:0;border-radius:12px;background:var(--sage-100,#eef2eb);font-size:21px;display:grid;place-items:center;cursor:pointer}
      .tf-inbox-icon-button:active{transform:scale(.96)}
      .tf-inbox-card-content{display:flex;align-items:center;gap:11px;min-width:0}
      .tf-inbox-card-copy{min-width:0}
      .tf-emoji-popover{position:fixed;z-index:10000;width:min(320px,calc(100vw - 24px));padding:12px;border:1px solid var(--line,#dce4d8);border-radius:18px;background:#fff;box-shadow:0 18px 50px rgba(30,45,35,.18)}
      .tf-emoji-popover-title{display:flex;align-items:center;justify-content:space-between;margin:0 2px 10px;font-size:13px;font-weight:800;color:var(--sage-700,#5f775d)}
      .tf-emoji-popover-close{border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:var(--muted,#728071)}
      .tf-emoji-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
      .tf-emoji-grid button{aspect-ratio:1;border:0;border-radius:11px;background:var(--sage-100,#eef2eb);font-size:21px;cursor:pointer}
      .tf-emoji-grid button:hover,.tf-emoji-grid button:focus-visible{outline:2px solid var(--sage-500,#8ba285);outline-offset:1px}
      .tf-emoji-reset{width:100%;margin-top:9px;border:0;border-radius:11px;background:transparent;padding:9px;font:inherit;font-size:13px;font-weight:700;color:var(--sage-700,#5f775d);cursor:pointer}
    `;
    document.head.appendChild(style);

    let openPopover: HTMLElement | null = null;

    const closePopover = () => {
      openPopover?.remove();
      openPopover = null;
    };

    const enhance = () => {
      const panel = [...document.querySelectorAll<HTMLElement>('section.panel')]
        .find(section => section.querySelector('h2')?.textContent?.trim() === 'Inbox');
      if (!panel) return;

      const appData = readJson<any>('tripflow-v2', {});
      const items = Array.isArray(appData.inbox) ? appData.inbox : [];
      const savedIcons = readJson<Record<string, string>>(ICONS_KEY, {});

      panel.querySelectorAll<HTMLElement>('.inbox-card').forEach(card => {
        if (card.dataset.emojiReady === '1') return;

        const titleNode = card.querySelector<HTMLElement>('h3');
        const firstColumn = card.firstElementChild as HTMLElement | null;
        if (!titleNode || !firstColumn) return;

        const title = cleanTitle(titleNode.textContent || '');
        const item = items.find((candidate: any) => cleanTitle(candidate?.title || '') === title);
        const itemId = item?.id || title;
        const fallback = placeEmoji(title, item?.placeType || '');

        card.dataset.emojiReady = '1';
        firstColumn.classList.add('tf-inbox-card-content');

        const copy = document.createElement('div');
        copy.className = 'tf-inbox-card-copy';
        while (firstColumn.firstChild) copy.appendChild(firstColumn.firstChild);

        const iconButton = document.createElement('button');
        iconButton.type = 'button';
        iconButton.className = 'tf-inbox-icon-button';
        iconButton.setAttribute('aria-label', `${title} 아이콘 변경`);
        iconButton.textContent = savedIcons[itemId] || fallback;

        firstColumn.append(iconButton, copy);

        iconButton.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          closePopover();

          const popover = document.createElement('div');
          popover.className = 'tf-emoji-popover';
          popover.innerHTML = '<div class="tf-emoji-popover-title"><span>아이콘 선택</span><button type="button" class="tf-emoji-popover-close" aria-label="닫기">×</button></div>';

          const grid = document.createElement('div');
          grid.className = 'tf-emoji-grid';
          ICONS.forEach(icon => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = icon;
            button.setAttribute('aria-label', `${icon} 선택`);
            button.addEventListener('click', pickerEvent => {
              pickerEvent.preventDefault();
              pickerEvent.stopPropagation();
              const next = readJson<Record<string, string>>(ICONS_KEY, {});
              next[itemId] = icon;
              localStorage.setItem(ICONS_KEY, JSON.stringify(next));
              iconButton.textContent = icon;
              closePopover();
            });
            grid.appendChild(button);
          });

          const reset = document.createElement('button');
          reset.type = 'button';
          reset.className = 'tf-emoji-reset';
          reset.textContent = '자동 추천 아이콘으로 되돌리기';
          reset.addEventListener('click', resetEvent => {
            resetEvent.preventDefault();
            resetEvent.stopPropagation();
            const next = readJson<Record<string, string>>(ICONS_KEY, {});
            delete next[itemId];
            localStorage.setItem(ICONS_KEY, JSON.stringify(next));
            iconButton.textContent = fallback;
            closePopover();
          });

          popover.querySelector('.tf-emoji-popover-close')?.addEventListener('click', closeEvent => {
            closeEvent.preventDefault();
            closeEvent.stopPropagation();
            closePopover();
          });
          popover.append(grid, reset);
          document.body.appendChild(popover);

          const rect = iconButton.getBoundingClientRect();
          const width = Math.min(320, window.innerWidth - 24);
          const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
          const preferredTop = rect.bottom + 8;
          const popoverHeight = popover.getBoundingClientRect().height;
          const top = preferredTop + popoverHeight < window.innerHeight - 12
            ? preferredTop
            : Math.max(12, rect.top - popoverHeight - 8);
          popover.style.left = `${left}px`;
          popover.style.top = `${top}px`;
          openPopover = popover;
        });
      });
    };

    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    enhance();

    const onDocumentClick = (event: MouseEvent) => {
      if (openPopover && !openPopover.contains(event.target as Node)) closePopover();
    };
    document.addEventListener('click', onDocumentClick);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', onDocumentClick);
      closePopover();
      style.remove();
    };
  }, []);

  return null;
}
