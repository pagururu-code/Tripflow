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

function parsePlaceNames(value: string) {
  const seen = new Set<string>();
  return value
    .split(/\r?\n/)
    .map(line => line
      .replace(/^\s*(?:[-*•·▪︎◦]|\d+[.)]|\([0-9]+\))\s*/, '')
      .trim())
    .filter(Boolean)
    .filter(name => {
      const key = normalize(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}

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
  const [placeNames, setPlaceNames] = useState('');
  const [places, setPlaces] = useState<ImportedPlace[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
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

  const paste = async (target: 'url' | 'names') => {
    try {
      const text = await navigator.clipboard.readText();
      if (target === 'url') setUrl(text);
      else setPlaceNames(text);
      setError('');
    } catch {
      setError('클립보드를 읽지 못했어요. 입력창을 길게 눌러 붙여넣어 주세요.');
    }
  };

  const loadLink = async () => {
    const value = url.trim();
    if (!value) return setError('Google Maps 저장목록 링크를 넣어 주세요.');
    setLoading(true);
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
      if (!response.ok) throw new Error(data.error || '목록을 가져오지 못했어요. 아래 장소명 목록 가져오기를 이용해 주세요.');
      const found: ImportedPlace[] = data.places || [];
      showPlaces(found, Boolean(data.needsReview));
      if (!found.length) setError('목록에서 장소를 찾지 못했어요. 아래에 장소명을 한 줄씩 붙여넣어 주세요.');
    } catch (e: any) {
      setError(`${e.message || '목록을 가져오지 못했어요.'} 아래 장소명 목록 가져오기를 이용해 주세요.`);
    } finally {
      setLoading(false);
    }
  };

  const loadNames = async () => {
    const names = parsePlaceNames(placeNames);
    if (!names.length) return setError('장소명을 한 줄에 하나씩 넣어 주세요.');
    setLoading(true);
    setError('');
    setDiagnostics([]);
    setPlaces([]);
    setNeedsReview(false);

    const found: ImportedPlace[] = [];
    const failed: string[] = [];
    try {
      for (let index = 0; index < names.length; index += 5) {
        const batch = names.slice(index, index + 5);
        const results = await Promise.all(batch.map(async name => {
          const query = [name, trip.city].filter(Boolean).join(' ');
          try {
            const response = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '검색 실패');
            const place = data.places?.[0];
            if (!place) return { name };
            return {
              name,
              place: {
                id: place.id || crypto.randomUUID(),
                title: place.displayName?.text || name,
                address: place.formattedAddress || place.shortFormattedAddress,
                location: place.location ? { lat: place.location.latitude, lng: place.location.longitude } : undefined,
                openingHours: place.regularOpeningHours?.weekdayDescriptions,
                mapUrl: place.googleMapsUri,
                verified: true,
              } as ImportedPlace,
            };
          } catch {
            return { name };
          }
        }));
        results.forEach(result => {
          if (result.place) found.push(result.place);
          else failed.push(result.name);
        });
      }

      showPlaces(found, true);
      if (failed.length) setDiagnostics([`검색하지 못한 장소: ${failed.join(', ')}`]);
      if (!found.length) setError('장소를 찾지 못했어요. 도시명이나 지점명을 함께 적어 다시 검색해 주세요.');
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
      placeType: place.placeType,
      mapUrl: place.mapUrl,
      source: 'google-maps',
    }));
    if (items.length) onAdd(items);
  };

  return (
    <div className="maps-import">
      <h2>가져오기</h2>
      <p className="sub">Google Maps 저장목록을 링크나 장소명 목록으로 가져올 수 있어요.</p>

      <section className="import-method">
        <h3>저장목록 링크</h3>
        <div className="import-url-row">
          <input
            value={url}
            onChange={event => setUrl(event.target.value)}
            placeholder="https://maps.app.goo.gl/..."
            inputMode="url"
            autoCapitalize="none"
            aria-label="저장목록 링크"
          />
          <button type="button" className="ghost paste-button" onClick={() => paste('url')}>
            <Clipboard size={16} /> 붙여넣기
          </button>
        </div>
        <button className="primary full" disabled={loading || !url.trim()} onClick={loadLink}>
          {loading ? '장소 정보 읽는 중…' : '링크로 가져오기'}
        </button>
      </section>

      <div className="import-divider"><span>또는</span></div>

      <section className="import-method">
        <h3>장소명 목록</h3>
        <p className="import-help">Google Maps 목록을 보면서 장소명을 한 줄에 하나씩 붙여넣어 주세요.</p>
        <textarea
          value={placeNames}
          onChange={event => setPlaceNames(event.target.value)}
          placeholder={'스프카레 가라쿠\n니조시장\n모이와야마 전망대'}
          rows={6}
        />
        <div className="two">
          <button type="button" className="ghost" onClick={() => paste('names')}>
            <Clipboard size={16} /> 목록 붙여넣기
          </button>
          <button className="primary" disabled={loading || !placeNames.trim()} onClick={loadNames}>
            {loading ? '검색 중…' : '장소 일괄 검색'}
          </button>
        </div>
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
            <b>{places.length}개의 장소 후보를 찾았어요</b>
            <small>장소명과 주소를 확인한 뒤 추가할 항목만 선택해 주세요.</small>
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
