'use client';

import { useMemo, useState } from 'react';
import { Check, Clipboard, ExternalLink, MapPin } from 'lucide-react';
import type { InboxItem, Trip } from '@/lib/types';

type ImportedPlace = {
  id: string;
  title: string;
  address?: string;
  location?: { lat: number; lng: number };
  openingHours?: string[];
  placeType?: string;
  mapUrl?: string;
  verified?: boolean;
  emoji?: string;
};

const normalize = (value = '') => value.toLocaleLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');

const parsePlaceUrls = (value: string) => {
  const matches = value.match(/https?:\/\/[^\s,]+/gi) || [];
  return [...new Set(matches.map(url => url.trim()).filter(Boolean))];
};

const emojiForPlace = (place: ImportedPlace) => {
  const value = `${place.placeType || ''} ${place.title}`.toLocaleLowerCase();
  if (/restaurant|food|meal|sushi|ramen|curry|izakaya|yakitori|yakiniku|barbecue|dining|음식|식당|레스토랑|초밥|소바|라멘|카레|야키니쿠|징기스칸|鮨|寿司|そば|蕎麦|ラーメン|カレー|焼肉|居酒屋|ハンバーグ/.test(value)) return '🍽️';
  if (/cafe|coffee|tea|bakery|dessert|parfait|ice cream|카페|커피|디저트|베이커리|제과|빵|パフェ|喫茶|珈琲|コーヒー|カフェ|パン|菓子/.test(value)) return '☕';
  if (/bar|pub|beer|wine|night club|재즈|라이브|술집|バー|ビール/.test(value)) return '🍸';
  if (/park|garden|nature|공원|정원|公園|庭園/.test(value)) return '🌿';
  if (/museum|gallery|university|temple|shrine|historic|박물관|미술관|대학교|신사|사찰|大学|博物館|美術館|神社|寺/.test(value)) return '🏛️';
  if (/hotel|lodging|ryokan|숙소|호텔|ホテル|旅館/.test(value)) return '🏨';
  if (/market|mall|department|store|shop|shopping|supermarket|convenience|기념품|상점|쇼핑|백화점|마트|편의점|시장|市場|百貨店|商店|ショップ|マルシェ|ドン.?キホーテ|ロフト|parco|大丸/.test(value)) return '🛍️';
  if (/station|airport|terminal|역|공항|駅|空港/.test(value)) return '🚉';
  if (/spa|onsen|hot spring|온천|스파|温泉/.test(value)) return '♨️';
  if (/aquarium|zoo|theme park|amusement|수족관|동물원|놀이공원|水族館|動物園/.test(value)) return '🎡';
  return '📍';
};

const stripLeadingEmoji = (value: string) => value.replace(/^\s*[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, '').trim();

export default function GoogleMapsImport({
  trip,
  existing,
  onAdd,
}: {
  trip: Trip;
  existing: InboxItem[];
  onAdd: (items: InboxItem[]) => void;
}) {
  const [listUrl, setListUrl] = useState('');
  const [placeUrl, setPlaceUrl] = useState('');
  const [places, setPlaces] = useState<ImportedPlace[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loadingMode, setLoadingMode] = useState<'list' | 'place' | null>(null);
  const [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [needsReview, setNeedsReview] = useState(false);
  const [placeProgress, setPlaceProgress] = useState<{ current: number; total: number } | null>(null);

  const existingKeys = useMemo(
    () => new Set(existing.map(item => normalize(`${stripLeadingEmoji(item.title)}|${item.address || ''}`))),
    [existing],
  );

  const isDuplicate = (place: ImportedPlace) =>
    existingKeys.has(normalize(`${stripLeadingEmoji(place.title)}|${place.address || ''}`)) ||
    existing.some(item => normalize(stripLeadingEmoji(item.title)) === normalize(stripLeadingEmoji(place.title)));

  const showPlaces = (found: ImportedPlace[], review = false) => {
    const decorated = found.map(place => ({ ...place, emoji: place.emoji || emojiForPlace(place) }));
    const unique = decorated.filter((place, index, all) =>
      all.findIndex(other => other.id === place.id || (
        normalize(stripLeadingEmoji(other.title)) === normalize(stripLeadingEmoji(place.title)) &&
        normalize(other.address || '') === normalize(place.address || '')
      )) === index,
    );
    setPlaces(unique);
    setNeedsReview(review);
    setSelected(Object.fromEntries(unique.map(place => [
      place.id,
      !isDuplicate(place) && place.verified !== false,
    ])));
  };

  const updatePlace = (id: string, patch: Partial<ImportedPlace>) => {
    setPlaces(current => current.map(place => place.id === id ? { ...place, ...patch } : place));
  };

  const paste = async (target: 'list' | 'place') => {
    try {
      const text = await navigator.clipboard.readText();
      if (target === 'list') setListUrl(text);
      else setPlaceUrl(text);
      setError('');
    } catch {
      setError('클립보드를 읽지 못했어요. 입력창을 길게 눌러 붙여넣어 주세요.');
    }
  };

  const loadList = async () => {
    const value = listUrl.trim();
    if (!value) return setError('Google Maps 저장목록 링크를 넣어 주세요.');
    setLoadingMode('list');
    setError('');
    setDiagnostics([]);
    setPlaces([]);
    setNeedsReview(false);
    try {
      const response = await fetch('/api/import/google-maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value, city: trip.city }),
      });
      const data = await response.json();
      setDiagnostics(Array.isArray(data.diagnostics) ? data.diagnostics : []);
      if (!response.ok) throw new Error(data.error || '저장목록을 가져오지 못했어요.');
      const found: ImportedPlace[] = data.places || [];
      showPlaces(found, Boolean(data.needsReview));
      if (!found.length) setError('저장목록에서 장소를 찾지 못했어요.');
    } catch (e: any) {
      setError(e.message || '저장목록을 가져오지 못했어요.');
    } finally {
      setLoadingMode(null);
    }
  };

  const loadPlace = async () => {
    const urls = parsePlaceUrls(placeUrl);
    if (!urls.length) return setError('Google 지도 장소 링크를 1개 이상 넣어 주세요.');

    setLoadingMode('place');
    setError('');
    setDiagnostics([]);
    setPlaces([]);
    setNeedsReview(false);
    setPlaceProgress({ current: 0, total: urls.length });

    const found: ImportedPlace[] = [];
    const failed: string[] = [];

    try {
      for (let index = 0; index < urls.length; index += 1) {
        const url = urls[index];
        setPlaceProgress({ current: index + 1, total: urls.length });
        try {
          const response = await fetch('/api/import/google-place', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, city: trip.city }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || '장소를 가져오지 못했어요.');
          const place: ImportedPlace | undefined = data.place;
          if (!place) throw new Error('장소 정보를 찾지 못했어요.');
          found.push(place);
        } catch (e: any) {
          failed.push(`${index + 1}번째 링크: ${e.message || '가져오기 실패'}`);
        }
      }

      showPlaces(found, false);
      setDiagnostics(failed);
      if (!found.length) setError('입력한 링크에서 장소를 가져오지 못했어요.');
      else if (failed.length) setError(`${found.length}개는 불러왔지만 ${failed.length}개는 실패했어요.`);
    } finally {
      setLoadingMode(null);
      setPlaceProgress(null);
    }
  };

  const chosen = places.filter(place => selected[place.id] && !isDuplicate(place));
  const save = () => {
    const items: InboxItem[] = chosen.map(place => ({
      id: crypto.randomUUID(),
      tripId: trip.id,
      title: `${place.emoji || '📍'} ${stripLeadingEmoji(place.title)}`,
      duration: 60,
      type: 'place',
      priority: 2,
      address: place.address,
      location: place.location,
      openingHours: place.openingHours,
      placeType: place.placeType,
      mapUrl: place.mapUrl,
      source: 'google-maps',
    }));
    if (items.length) onAdd(items);
  };

  return (
    <div className="maps-import">
      <h2>가져오기</h2>
      <p className="sub">Google Maps 저장목록이나 개별 장소 링크를 가져올 수 있어요.</p>

      <section className="import-method">
        <h3>저장목록 링크</h3>
        <p className="import-help">여러 장소가 담긴 Google Maps 저장목록 공유 링크예요.</p>
        <div className="import-url-row">
          <input value={listUrl} onChange={event => setListUrl(event.target.value)} placeholder="https://maps.app.goo.gl/..." inputMode="url" autoCapitalize="none" aria-label="저장목록 링크" />
          <button type="button" className="ghost paste-button" onClick={() => paste('list')}><Clipboard size={16} /> 붙여넣기</button>
        </div>
        <button className="primary full" disabled={Boolean(loadingMode) || !listUrl.trim()} onClick={loadList}>{loadingMode === 'list' ? '목록 읽는 중…' : '저장목록 가져오기'}</button>
      </section>

      <div className="import-divider"><span>또는</span></div>

      <section className="import-method">
        <h3>Google 지도 장소 링크</h3>
        <p className="import-help">링크 1개 또는 여러 개를 줄바꿈이나 쉼표로 구분해 붙여넣어 주세요.</p>
        <div className="import-url-row" style={{ alignItems: 'stretch' }}>
          <textarea value={placeUrl} onChange={event => setPlaceUrl(event.target.value)} placeholder={'https://maps.app.goo.gl/...\nhttps://maps.app.goo.gl/...'} inputMode="url" autoCapitalize="none" aria-label="Google 지도 장소 링크" rows={4} style={{ width: '100%', minHeight: 104, resize: 'vertical', border: '1px solid #d9d6ce', background: 'white', borderRadius: 14, padding: 13, font: 'inherit' }} />
          <button type="button" className="ghost paste-button" onClick={() => paste('place')}><Clipboard size={16} /> 붙여넣기</button>
        </div>
        <button className="primary full" disabled={Boolean(loadingMode) || !placeUrl.trim()} onClick={loadPlace}>{loadingMode === 'place' ? `${placeProgress?.current || 0}/${placeProgress?.total || 0} 읽는 중…` : '장소 가져오기'}</button>
      </section>

      {error && <p className="error-message">{error}</p>}
      {needsReview && places.length > 0 && <p className="notice">검색 결과가 맞는지 확인하고 실제 저장한 장소만 체크해 주세요.</p>}
      {diagnostics.length > 0 && <details className="import-diagnostics"><summary>확인할 내용</summary>{diagnostics.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}</details>}

      {places.length > 0 && (
        <>
          <div className="import-summary"><b>{places.length}개의 장소를 찾았어요</b><small>종류에 따라 아이콘을 자동 지정했어요. 아이콘과 장소명은 바로 수정할 수 있어요.</small></div>
          <div className="import-list">
            {places.map(place => {
              const duplicate = isDuplicate(place);
              return (
                <div className={`import-place import-place-editable ${duplicate ? 'duplicate' : ''}`} key={place.id}>
                  <label className="import-select" aria-label={`${place.title} 선택`}>
                    <input type="checkbox" checked={!duplicate && Boolean(selected[place.id])} disabled={duplicate} onChange={event => setSelected(current => ({ ...current, [place.id]: event.target.checked }))} />
                    <span className="import-check"><Check size={14} /></span>
                  </label>
                  <input className="place-emoji-input" value={place.emoji || ''} onChange={event => updatePlace(place.id, { emoji: Array.from(event.target.value).slice(0, 2).join('') })} aria-label={`${place.title} 아이콘`} maxLength={4} />
                  <span className="import-place-copy">
                    <input className="place-title-input" value={stripLeadingEmoji(place.title)} onChange={event => updatePlace(place.id, { title: event.target.value })} aria-label="장소명 수정" />
                    <small><MapPin size={12} />{place.address || '주소 정보 없음'}</small>
                  </span>
                  {duplicate ? <em>이미 있음</em> : place.mapUrl && <a href={place.mapUrl} target="_blank" rel="noreferrer" aria-label="Google 지도에서 열기"><ExternalLink size={15} /></a>}
                </div>
              );
            })}
          </div>
          <button className="primary full" disabled={!chosen.length} onClick={save}>선택한 {chosen.length}개를 Inbox에 추가</button>
        </>
      )}
    </div>
  );
}
