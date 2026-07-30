'use client';

import { useState } from 'react';
import { FileDown, ImageDown, Share2, X } from 'lucide-react';
import type { AppData, InboxItem, Schedule, Trip } from '@/lib/types';

type DayTitleMap = Record<string, { icon: string; title: string }>;
type ExportData = { trip: Trip; schedules: Schedule[]; inbox: InboxItem[]; dayTitles: DayTitleMap };

const parseDate = (value: string) => { const [y,m,d] = value.split('-').map(Number); return new Date(y,m-1,d); };
const formatDate = (value: string) => { const d = parseDate(value); return `${d.getMonth()+1}월 ${d.getDate()}일 ${['일','월','화','수','목','금','토'][d.getDay()]}요일`; };
const dates = (start: string, end: string) => { const out:string[]=[]; for (let d=parseDate(start), last=parseDate(end); d<=last; d.setDate(d.getDate()+1)) out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); return out; };
const duration = (minutes:number) => `${Math.floor(minutes/60) ? `${Math.floor(minutes/60)}시간 ` : ''}${minutes%60 ? `${minutes%60}분` : ''}`.trim();
const safeName = (value:string) => value.replace(/[\\/:*?"<>|]/g,'').trim() || 'TripFlow';

function readExportData(): ExportData | null {
  const raw = localStorage.getItem('tripflow-v2');
  if (!raw) return null;
  const data = JSON.parse(raw) as AppData;
  const trip = data.trips.find(item => item.id === data.activeTripId) || data.trips[0];
  if (!trip) return null;
  const titleRaw = localStorage.getItem('tripflow-day-titles-v1');
  const allTitles = titleRaw ? JSON.parse(titleRaw) as DayTitleMap : {};
  return {
    trip,
    schedules: data.schedules.filter(item => item.tripId === trip.id),
    inbox: data.inbox.filter(item => item.tripId === trip.id),
    dayTitles: Object.fromEntries(Object.entries(allTitles).filter(([key]) => key.startsWith(`${trip.id}:`))),
  };
}

const escapeHtml = (value='') => value.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch] || ch));

function buildPrintHtml(data: ExportData) {
  const dayPages = dates(data.trip.startDate, data.trip.endDate).map((date,index) => {
    const items = data.schedules.filter(item => item.date === date).sort((a,b) => a.start.localeCompare(b.start));
    const title = data.dayTitles[`${data.trip.id}:${date}`];
    const rows = items.length ? items.map(item => `<article><div class="time">${escapeHtml(item.start)}</div><div class="content"><span>${escapeHtml(item.type === 'place' ? 'PLACE' : item.type.toUpperCase())}</span><h3>${escapeHtml(item.title)}</h3>${item.address ? `<p>${escapeHtml(item.address)}</p>` : ''}<small>${escapeHtml(duration(item.duration))}${item.openingHours?.[0] ? ` · ${escapeHtml(item.openingHours[0])}` : ''}</small>${item.note ? `<p class="note">${escapeHtml(item.note)}</p>` : ''}</div></article>`).join('') : '<p class="empty">등록된 일정이 없어요.</p>';
    return `<section class="page"><header><div><b>DAY ${index+1}</b><h1>${escapeHtml(formatDate(date))}</h1>${title?.title ? `<h2>${escapeHtml(`${title.icon || ''} ${title.title}`)}</h2>` : ''}</div><small>${escapeHtml(data.trip.city)}</small></header><main>${rows}</main></section>`;
  }).join('');
  const inbox = `<section class="page"><header><div><b>INBOX</b><h1>아직 배치하지 않은 후보</h1></div><small>${data.inbox.length}곳</small></header><main>${data.inbox.length ? data.inbox.map(item => `<article><div class="time">${'★'.repeat(item.priority || 1)}</div><div class="content"><h3>${escapeHtml(item.title)}</h3>${item.address ? `<p>${escapeHtml(item.address)}</p>` : ''}<small>${escapeHtml(duration(item.duration))}</small>${item.note ? `<p class="note">${escapeHtml(item.note)}</p>` : ''}</div></article>`).join('') : '<p class="empty">Inbox가 비어 있어요.</p>'}</main></section>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(data.trip.title)}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:#17231d;background:#eef1ec}.page{width:210mm;min-height:297mm;padding:20mm 17mm;background:#fff;page-break-after:always}.page:last-child{page-break-after:auto}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #17231d;padding-bottom:18px;margin-bottom:24px}header b{font-size:12px;letter-spacing:.18em;color:#718074}header h1{font-size:30px;margin:8px 0 0}header h2{font-size:17px;margin:10px 0 0;color:#617064}header small{font-size:13px;color:#718074}article{display:grid;grid-template-columns:72px 1fr;gap:16px;padding:18px 0;border-bottom:1px solid #dfe5dd}.time{font-weight:800;color:#637066}.content span{font-size:10px;letter-spacing:.12em;color:#8a958c}.content h3{font-size:19px;margin:5px 0 7px}.content p{margin:4px 0;color:#59645b;font-size:13px;line-height:1.5}.content small{color:#7b877e}.content .note{background:#f1f4ef;border-radius:10px;padding:8px 10px;margin-top:9px}.empty{padding:50px 0;text-align:center;color:#879188}</style></head><body>${dayPages}${inbox}<script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
}

function wrapText(ctx:CanvasRenderingContext2D, text:string, maxWidth:number) {
  const words = Array.from(text); const lines:string[]=[]; let line='';
  words.forEach(char => { const next=line+char; if (ctx.measureText(next).width>maxWidth && line) { lines.push(line); line=char; } else line=next; });
  if (line) lines.push(line); return lines;
}

function drawText(ctx:CanvasRenderingContext2D, text:string, x:number, y:number, maxWidth:number, lineHeight:number, maxLines=3) {
  const lines=wrapText(ctx,text,maxWidth).slice(0,maxLines); lines.forEach((line,index)=>ctx.fillText(line,x,y+index*lineHeight)); return y+lines.length*lineHeight;
}

async function exportPng(data: ExportData) {
  const dayList = dates(data.trip.startDate, data.trip.endDate);
  const pageW=720, pageH=1080, gap=28, scale=2;
  const pages = dayList.length + 1;
  const canvas=document.createElement('canvas'); canvas.width=(pageW*pages+gap*(pages-1))*scale; canvas.height=pageH*scale;
  const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('canvas'); ctx.scale(scale,scale);
  ctx.fillStyle='#e9eee8'; ctx.fillRect(0,0,canvas.width/scale,canvas.height/scale);
  const drawPage=(pageIndex:number,label:string,heading:string,subheading:string,items:{time:string;title:string;meta:string;note?:string}[])=>{
    const ox=pageIndex*(pageW+gap); ctx.fillStyle='#fff'; ctx.fillRect(ox,0,pageW,pageH);
    ctx.fillStyle='#17231d'; ctx.font='800 15px -apple-system, sans-serif'; ctx.fillText(label,ox+50,60);
    ctx.font='800 32px -apple-system, sans-serif'; ctx.fillText(heading,ox+50,110);
    ctx.fillStyle='#708076'; ctx.font='600 16px -apple-system, sans-serif'; ctx.fillText(subheading,ox+50,142);
    ctx.strokeStyle='#17231d'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(ox+50,170); ctx.lineTo(ox+pageW-50,170); ctx.stroke();
    let y=205;
    items.slice(0,10).forEach(item=>{
      ctx.fillStyle='#637066'; ctx.font='800 17px -apple-system, sans-serif'; ctx.fillText(item.time,ox+50,y+8);
      ctx.fillStyle='#17231d'; ctx.font='800 20px -apple-system, sans-serif'; const titleEnd=drawText(ctx,item.title,ox+145,y+8,pageW-195,25,2);
      ctx.fillStyle='#748078'; ctx.font='500 14px -apple-system, sans-serif'; const metaEnd=drawText(ctx,item.meta,ox+145,titleEnd+2,pageW-195,20,2);
      let rowEnd=Math.max(y+68,metaEnd+10);
      if(item.note){ctx.fillStyle='#f1f4ef';ctx.fillRect(ox+145,rowEnd-2,pageW-195,38);ctx.fillStyle='#617064';ctx.font='500 13px -apple-system, sans-serif';drawText(ctx,item.note,ox+157,rowEnd+20,pageW-220,17,1);rowEnd+=48;}
      ctx.strokeStyle='#e2e7e1';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ox+50,rowEnd);ctx.lineTo(ox+pageW-50,rowEnd);ctx.stroke();y=rowEnd+18;
    });
    if(!items.length){ctx.fillStyle='#8a948c';ctx.font='600 18px -apple-system, sans-serif';ctx.fillText('등록된 내용이 없어요.',ox+50,240);}
    ctx.fillStyle='#9aa49c';ctx.font='600 12px -apple-system, sans-serif';ctx.fillText(`TRIPFLOW · ${data.trip.title}`,ox+50,pageH-38);
  };
  dayList.forEach((date,index)=>{const title=data.dayTitles[`${data.trip.id}:${date}`];const items=data.schedules.filter(item=>item.date===date).sort((a,b)=>a.start.localeCompare(b.start)).map(item=>({time:item.start,title:item.title,meta:[item.address,duration(item.duration),item.openingHours?.[0]].filter(Boolean).join(' · '),note:item.note}));drawPage(index,`DAY ${index+1}`,formatDate(date),title?.title ? `${title.icon || ''} ${title.title}` : data.trip.city,items);});
  drawPage(dayList.length,'INBOX','아직 배치하지 않은 후보',`${data.inbox.length}곳`,data.inbox.map(item=>({time:'★'.repeat(item.priority||1),title:item.title,meta:[item.address,duration(item.duration)].filter(Boolean).join(' · '),note:item.note})));
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('png')),'image/png'));
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${safeName(data.trip.title)}-가이드북.png`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function ShareTripButton() {
  const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false);
  const run=async(type:'pdf'|'png')=>{const data=readExportData();if(!data){alert('내보낼 여행 데이터가 아직 없어요.');return;}setBusy(true);try{if(type==='pdf'){const popup=window.open('','_blank');if(!popup)throw new Error('popup');popup.document.write(buildPrintHtml(data));popup.document.close();}else await exportPng(data);setOpen(false);}catch(error){console.error(error);alert(type==='pdf'?'PDF 화면을 여는 중 오류가 발생했어요. 팝업 차단을 확인해주세요.':'PNG를 만드는 중 오류가 발생했어요.');}finally{setBusy(false);}};
  return <><button type="button" onClick={()=>setOpen(true)} aria-label="여행 내보내기" style={{position:'fixed',right:18,bottom:86,zIndex:40,border:0,borderRadius:999,padding:'12px 16px',display:'flex',alignItems:'center',gap:8,background:'#17231d',color:'#fff',fontWeight:800,boxShadow:'0 10px 28px rgba(23,35,29,.25)'}}><Share2 size={18}/>공유</button>{open&&<div onMouseDown={e=>e.currentTarget===e.target&&setOpen(false)} style={{position:'fixed',inset:0,zIndex:80,background:'rgba(9,18,13,.45)',display:'grid',placeItems:'end center',padding:16}}><section style={{width:'min(520px,100%)',background:'#fff',borderRadius:24,padding:22,boxShadow:'0 18px 50px rgba(0,0,0,.22)'}}><button onClick={()=>setOpen(false)} aria-label="닫기" style={{float:'right',border:0,background:'transparent'}}><X/></button><h2 style={{margin:'0 0 8px'}}>여행 계획 공유</h2><p style={{margin:'0 0 18px',color:'#647067',lineHeight:1.55}}>현재 여행을 파일로 저장해 카톡이나 ChatGPT에 바로 보낼 수 있어요.</p><div style={{display:'grid',gap:10}}><button disabled={busy} onClick={()=>run('pdf')} style={{border:0,borderRadius:16,padding:'16px 18px',display:'flex',alignItems:'center',gap:12,textAlign:'left',background:'#17231d',color:'#fff',fontWeight:800}}><FileDown/><span>PDF로 저장<small style={{display:'block',fontWeight:500,opacity:.78,marginTop:3}}>날짜별 한 페이지 · 인쇄 화면에서 PDF 저장</small></span></button><button disabled={busy} onClick={()=>run('png')} style={{border:'1px solid #d9e0d8',borderRadius:16,padding:'16px 18px',display:'flex',alignItems:'center',gap:12,textAlign:'left',background:'#f7f9f6',color:'#17231d',fontWeight:800}}><ImageDown/><span>PNG 가이드북 저장<small style={{display:'block',fontWeight:500,color:'#6e7a71',marginTop:3}}>일별 페이지가 오른쪽으로 이어진 한 장</small></span></button></div>{busy&&<p style={{textAlign:'center',margin:'14px 0 0',color:'#6e7a71'}}>파일 만드는 중…</p>}</section></div>}</>;
}
