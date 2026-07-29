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
};

const normalize = (value = '') => value.toLocaleLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');

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

  const existingKeys = useMemo(
    () => new Set(existing.map(item => normalize(`${item.title}|${item.address || ''}`))),
    [existing],
  );

  const isDuplicate = (place: ImportedPlace) =>
    existingKeys.has(normalize(`${place.title}|${place.address || ''}`)) ||
    existing.some(item => normalize(item.title) === normalize(place.title));

  const showPlaces = (found: ImportedPlace[], review = false) => {
    const unique = found.filter((place, index, all) =>
      all.findIndex(other => other.id === place.id || (
        normalize(other.title) === normalize(place.title) &&
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
    const value = placeUrl.trim();
    if (!value) return setError('Google 지도 장소 링크를 넣어 주세요.');
    setLoadingMode('place');
    setError('');
    setDiagnostics([]);
    setPlaces([]);
    setNeedsReview(false);
    try {
      const response = await fetch('/api/import/google-place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value, city: trip.city }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '장소를 가져오지 못했어요.');
      const place: ImportedPlace | undefined = data.place;
      if (!place) throw new Error('장소 정보를 찾지 못했어요.');
      showPlaces([place], false);
    } catch (e: any) {
      setError(e.message || '장소를 가져오지 못했어요.');
    } finally {
      setLoadingMode(null);
    }
  };

  const chosen = places.filter(place => selected[place.id] && !isDuplicate(place));
  const save = () => {
    const items: InboxItem[] = chosen.map(place => ({
      id: crypto.randomUUID(),
      tripId: trip.id,
      title: place.title,
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
      <p className="sub">Google Maps 저장목록이나 장소 하나를 링크로 가져올 수 있어요.</p>

      <section className="import-method">
        <h3>저장목록 링크</h3>
        <p className="import-help">여러 장소가 담긴 Google Maps 저장목록 공유 링크예요.</p>
        <div className="import-url-row">
          <input
            value={listUrl}
            onChange={event => setListUrl(event.target.value)}
            placeholder="https://maps.app.goo.gl/..."
            inputMode="url"
            autoCapitalize="none"
            aria-label="저장목록 링크"
          />
          <button type="button" className="ghost paste-button" onClick={() => paste('list')}>
            <Clipboard size={16} /> 붙여넣기
          </button>
        </div>
        <button className="primary full" disabled={Boolean(loadingMode) || !listUrl.trim()} onClick={loadList}>
          {loadingMode === 'list' ? '목록 읽는 중…' : '저장목록 가져오기'}
        </button>
      </section>

      <div className="import-divider"><span>또는</span></div>

      <section className="import-method">
        <h3>Google 지도 장소 링크</h3>
        <p className="import-help">Google 지도에서 장소 하나를 연 뒤 공유 링크를 붙여넣어 주세요.</p>
        <div className="import-url-row">
          <input
            value={placeUrl}
            onChange={event => setPlaceUrl(event.target.value)}
            placeholder="https://maps.app.goo.gl/..."
            inputMode="url"
            autoCapitalize="none"
            aria-label="Google 지도 장소 링크"
          />
          <button type="button" className="ghost paste-button" onClick={() => paste('place')}>
            <Clipboard size={16} /> 붙여넣기
          </button>
        </div>
        <button className="primary full" disabled={Boolean(loadingMode) || !placeUrl.trim()} onClick={loadPlace}>
          {loadingMode === 'place' ? '장소 읽는 중…' : '장소 가져오기'}
        </button>
      </section>

      {error && <p className="error-message">{error}</p>}
      {needsReview && places.length > 0 && (
        <p className="notice">검색 결과가 맞는지 확인하고 실제 저장한 장소만 체크해 주세요.</p>
      )}
      {diagnostics.length > 0 && (
        <details className="import-diagnostics">
          <summary>확인할 내용</summary>
          {diagnostics.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}
        </details>
      )}

      {places.length > 0 && (
        <>
          <div className="import-summary">
            <b>{places.length}개의 장소를 찾았어요</b>
            <small>장소명과 주소를 확인한 뒤 추가해 주세요.</small>
          </div>
          <div className="import-list">
            {places.map(place => {
              const duplicate = isDuplicate(place);
              return (
                <label className={`import-place ${duplicate ? 'duplicate' : ''}`} key={place.id}>
                  <input
                    type="checkbox"
                    checked={!duplicate && Boolean(selected[place.id])}
                    disabled={duplicate}
                    onChange={event => setSelected(current => ({ ...current, [place.id]: event.target.checked }))}
                  />
                  <span className="import-check"><Check size={14} /></span>
                  <span className="import-place-copy">
                    <b>{place.title}</b>
                    <small><MapPin size={12} />{place.address || '주소 정보 없음'}</small>
                  </span>
                  {duplicate ? <em>이미 있음</em> : place.mapUrl && <ExternalLink size={15} />}
                </label>
              );
            })}
          </div>
          <button className="primary full" disabled={!chosen.length} onClick={save}>
            선택한 {chosen.length}개를 Inbox에 추가
          </button>
        </>
      )}
    </div>
  );
}
