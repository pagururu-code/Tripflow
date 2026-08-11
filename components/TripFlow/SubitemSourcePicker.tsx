'use client';

import { useEffect } from 'react';
import type { AppData, InboxItem } from '@/lib/types';

const STORAGE_KEY = 'tripflow-v2';
const PICKER_ATTRIBUTE = 'data-subitem-source-picker';

type PickerTab = 'manual' | 'inbox' | 'place';

function readAppData(): AppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as AppData : null;
  } catch {
    return null;
  }
}

function setReactInputValue(input:HTMLInputElement,value:string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  setter?.call(input,value);
  input.dispatchEvent(new Event('input',{ bubbles:true }));
  input.dispatchEvent(new Event('change',{ bubbles:true }));
}

function addSubitemTitle(sheet:HTMLElement,title:string) {
  const clean = title.trim();
  if (!clean) return;
  const addButton = sheet.querySelector<HTMLButtonElement>('.tf-add-subitem');
  addButton?.click();
  requestAnimationFrame(() => {
    const inputs = sheet.querySelectorAll<HTMLInputElement>('.tf-subitem-row input');
    const last = inputs[inputs.length - 1];
    if (!last) return;
    setReactInputValue(last,clean);
    last.focus();
  });
}

function makeButton(label:string,onClick:()=>void,className='') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click',onClick);
  return button;
}

function inboxItems():InboxItem[] {
  const data = readAppData();
  if (!data) return [];
  const trip = data.trips.find(item => item.id === data.activeTripId) || data.trips[0];
  if (!trip) return [];
  return data.inbox.filter(item => item.tripId === trip.id);
}

function mountPicker(sheet:HTMLElement) {
  if (sheet.querySelector(`[${PICKER_ATTRIBUTE}]`)) return;
  const addButton = sheet.querySelector<HTMLButtonElement>('.tf-add-subitem');
  if (!addButton) return;

  const root = document.createElement('section');
  root.setAttribute(PICKER_ATTRIBUTE,'');
  root.className = 'tf-subitem-source-picker';

  const tabs = document.createElement('div');
  tabs.className = 'tf-subitem-source-tabs';
  const body = document.createElement('div');
  body.className = 'tf-subitem-source-body';
  root.append(tabs,body);
  addButton.before(root);

  let active:PickerTab = 'manual';
  const tabButtons = new Map<PickerTab,HTMLButtonElement>();

  const render = () => {
    tabButtons.forEach((button,key) => button.classList.toggle('active',key === active));
    body.replaceChildren();

    if (active === 'manual') {
      const note = document.createElement('p');
      note.className = 'tf-subitem-source-note';
      note.textContent = '아래 “+ 하위 코스 추가”에서 직접 입력할 수 있어요.';
      body.append(note);
      return;
    }

    if (active === 'inbox') {
      const items = inboxItems();
      const list = document.createElement('div');
      list.className = 'tf-subitem-source-list';
      if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'tf-subitem-source-note';
        empty.textContent = 'Inbox에 저장된 장소가 없어요.';
        list.append(empty);
      } else {
        items.forEach(item => {
          const row = document.createElement('div');
          row.className = 'tf-subitem-source-row';
          const copy = document.createElement('div');
          const title = document.createElement('b');
          title.textContent = item.title;
          const meta = document.createElement('small');
          meta.textContent = item.address || '장소 미정';
          copy.append(title,meta);
          const add = makeButton('추가',() => addSubitemTitle(sheet,item.title),'tf-subitem-source-add');
          row.append(copy,add);
          list.append(row);
        });
      }
      body.append(list);
      return;
    }

    const searchRow = document.createElement('div');
    searchRow.className = 'tf-subitem-search-row';
    const input = document.createElement('input');
    input.placeholder = '장소명 검색';
    const searchButton = makeButton('검색',async() => {
      const query = input.value.trim();
      if (!query) return;
      searchButton.textContent = '…';
      searchButton.disabled = true;
      try {
        const response = await fetch('/api/places/search?q=' + encodeURIComponent(query));
        const result = await response.json();
        resultList.replaceChildren();
        const places = result.places || [];
        if (!places.length) {
          const empty = document.createElement('p');
          empty.className = 'tf-subitem-source-note';
          empty.textContent = '검색 결과가 없어요.';
          resultList.append(empty);
        } else {
          places.forEach((place:any) => {
            const titleText = place.displayName?.text || query;
            const row = document.createElement('div');
            row.className = 'tf-subitem-source-row';
            const copy = document.createElement('div');
            const title = document.createElement('b');
            title.textContent = titleText;
            const meta = document.createElement('small');
            meta.textContent = place.formattedAddress || '주소 없음';
            copy.append(title,meta);
            const add = makeButton('추가',() => addSubitemTitle(sheet,titleText),'tf-subitem-source-add');
            row.append(copy,add);
            resultList.append(row);
          });
        }
      } finally {
        searchButton.textContent = '검색';
        searchButton.disabled = false;
      }
    },'tf-subitem-search-button');
    input.addEventListener('keydown',event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        searchButton.click();
      }
    });
    searchRow.append(input,searchButton);
    const resultList = document.createElement('div');
    resultList.className = 'tf-subitem-source-list';
    body.append(searchRow,resultList);
  };

  ([['manual','직접 입력'],['inbox','Inbox'],['place','장소 검색']] as [PickerTab,string][]).forEach(([key,label]) => {
    const button = makeButton(label,() => { active = key; render(); });
    tabButtons.set(key,button);
    tabs.append(button);
  });
  render();
}

function scan() {
  document.querySelectorAll<HTMLElement>('.tf-timeline-sheet').forEach(sheet => {
    if (sheet.querySelector('h2')?.textContent?.trim() === '하위목록') mountPicker(sheet);
  });
}

export default function SubitemSourcePicker() {
  useEffect(() => {
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body,{ childList:true,subtree:true });
    return () => observer.disconnect();
  },[]);

  return <style jsx global>{`
    .tf-subitem-source-picker{margin:14px 0 12px}
    .tf-subitem-source-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;background:#e9eee5;padding:4px;border-radius:14px;margin-bottom:10px}
    .tf-subitem-source-tabs button{border:0;background:transparent;border-radius:11px;padding:9px 5px;font-size:12px;font-weight:800;color:#69766e}
    .tf-subitem-source-tabs button.active{background:#fff;color:#24372d;box-shadow:0 2px 8px rgba(23,35,29,.07)}
    .tf-subitem-source-body{max-height:240px;overflow:auto}
    .tf-subitem-source-note{margin:8px 2px;color:#7c8780;font-size:12px;line-height:1.45}
    .tf-subitem-source-list{display:grid;gap:7px}
    .tf-subitem-source-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;background:#fff;border:1px solid #e1e7e2;border-radius:13px;padding:9px 10px}
    .tf-subitem-source-row>div{min-width:0}.tf-subitem-source-row b{display:block;font-size:13px;color:#31443a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tf-subitem-source-row small{display:block;margin-top:2px;font-size:10.5px;color:#87918b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tf-subitem-source-add{border:0;background:#e9f2ec;color:#31443a;border-radius:10px;padding:7px 10px;font-size:11px;font-weight:850}
    .tf-subitem-search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-bottom:9px}.tf-subitem-search-row input{min-width:0;background:#fff;border:1px solid #dfe5e1;border-radius:12px;padding:10px 11px}.tf-subitem-search-button{border:0;background:#20382b;color:#fff;border-radius:12px;padding:0 13px;font-weight:850}
  `}</style>;
}
