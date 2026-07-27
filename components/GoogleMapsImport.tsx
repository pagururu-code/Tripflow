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
  mapUrl?: string;
  rawTitle?: string;
  candidateSource?: 'json-ld' | 'place-url' | 'embedded-name' | 'bootstrap';
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
  const [url, setUrl] = useState('');
  const [places, setPlaces] = useState<ImportedPlace[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const existingKeys = useMemo(
    () => new Set(existing.map(item => normalize(`${item.title}|${item.address || ''}`))),
    [existing],
  );

  const isDuplicate = (place: ImportedPlace) =>
    existingKeys.has(normalize(`${place.title}|${place.address || ''}`)) ||
    existing.some(item => normalize(item.title) === normalize(place.title));

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError('');
    } catch {
      setError('클립보드를 읽지 못했어요. 링크를 길게 눌러 붙여넣어 주세요.');
    }
  };

  const load = async () => {
    const value = url.trim();
    if (!value) return setError('Google Maps 저장목록 링크를 넣어 주세요.');
    setLoading(true);
    setError('');
    setPlaces([]);
    try {
      const response = await fetch('/api/import/google-maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '목록을 가져오지 못했어요.');
      const found: ImportedPlace[] = data.places || [];
      setPlaces(found);
      setSelected(Object.fromEntries(found.map(place => [place.id, !isDuplicate(place)])));
      if (!found.length) setError('목록에서 장소를 찾지 못했어요. 목록을 공유 가능 상태로 바꾼 뒤 다시 시도해 주세요.');
    } catch (e: any) {
      setError(e.message || '목록을 가져오지 못했어요.');
    } finally {
      setLoading(false);
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
      mapUrl: place.mapUrl,
      source: 'google-maps',
    }));
    if (items.length) onAdd(items);
  };

  return (
    <div className="maps-import">
      <h2>가져오기</h2>
      <p className="sub">Google Maps 저장목록의 공유 링크를 붙여넣어 주세요.</p>

      <label>
        저장목록 링크
        <div className="import-url-row">
          <input
            value={url}
            onChange={event => setUrl(event.target.value)}
            placeholder="https://maps.app.goo.gl/..."
            inputMode="url"
            autoCapitalize="none"
          />
          <button type="button" className="ghost paste-button" onClick={paste}>
            <Clipboard size={16} /> 붙여넣기
          </button>
        </div>
      </label>

      <button className="primary full" disabled={loading || !url.trim()} onClick={load}>
        {loading ? '저장목록 읽는 중…' : '가져오기'}
      </button>

      {error && <p className="error-message">{error}</p>}

      {places.length > 0 && (
        <>
          <div className="import-summary">
            <b>{places.length}개의 장소를 찾았어요</b>
            <small>이미 Inbox에 있는 장소는 자동으로 제외돼요.</small>
          </div>
          <div className="import-list">
            {places.map(place => {
              const duplicate = isDuplicate(place);
              const showDiagnostic = place.rawTitle && normalize(place.rawTitle) !== normalize(place.title);
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
                    {showDiagnostic && (
                      <small>추출값: {place.rawTitle} · {place.candidateSource || 'unknown'}</small>
                    )}
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
