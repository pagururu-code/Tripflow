(() => {
  let places = [];
  const status = document.querySelector('#status');
  const list = document.querySelector('#places');
  const copy = document.querySelector('#copy');
  const importButton = document.querySelector('#import');
  const tripflowUrl = document.querySelector('#tripflow-url');

  browser.storage.local.get('tripflowUrl').then(value => { tripflowUrl.value = value.tripflowUrl || ''; });
  tripflowUrl.addEventListener('change', () => browser.storage.local.set({ tripflowUrl: tripflowUrl.value.trim() }));

  document.querySelector('#extract').addEventListener('click', async () => {
    status.textContent = '목록을 끝까지 읽는 중…';
    list.replaceChildren();
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const result = await browser.tabs.sendMessage(tab.id, { type: 'TRIPFLOW_EXTRACT' });
      places = result?.places || [];
      if (places.length === 0) throw new Error('Google Maps 구조가 변경되었습니다.');
      const mismatch = result?.expected != null && result.expected !== places.length;
      status.textContent = mismatch
        ? `${places.length}/${result.expected}개 발견 — 목록을 다시 연 뒤 재시도해 주세요.`
        : `${places.length}개 발견`;
      document.querySelector('#diagnostics').textContent = JSON.stringify(result?.diagnostics, null, 2);
      for (const place of places) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.textContent = place.title;
        link.href = place.mapUrl;
        link.target = '_blank';
        item.append(link, ` (${place.source})`);
        list.append(item);
      }
      copy.disabled = places.length === 0;
      importButton.disabled = places.length === 0 || mismatch;
    } catch (error) {
      status.textContent = String(error).includes('구조가 변경')
        ? 'Google Maps 구조가 변경되었습니다.'
        : 'Google Maps 저장목록 탭에서 다시 시도해 주세요.';
      document.querySelector('#diagnostics').textContent = String(error);
    }
  });

  importButton.addEventListener('click', async () => {
    const base = tripflowUrl.value.trim().replace(/\/$/, '');
    if (!/^https:\/\//i.test(base)) {
      status.textContent = 'HTTPS TripFlow 주소를 먼저 입력해 주세요.';
      return;
    }
    importButton.disabled = true;
    status.textContent = `${places.length}개 장소 정보를 보강하는 중…`;
    try {
      await browser.storage.local.set({ tripflowUrl: base });
      const originPermission = `${new URL(base).origin}/*`;
      const granted = await browser.permissions.request({ origins: [originPermission] });
      if (!granted) throw new Error('TripFlow 사이트 접근 권한이 필요합니다.');
      const response = await fetch(`${base}/api/import/browser`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ places })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      const payload = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(result)))));
      await browser.tabs.create({ url: `${base}/#browser-import=${payload}` });
      status.textContent = `${result.places.length}개 전송 완료 · 중복 ${result.duplicates}개 제외 · 실패 ${result.failed}개`;
    } catch (error) {
      status.textContent = `가져오기 실패: ${error.message || error}`;
      importButton.disabled = false;
    }
  });

  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(JSON.stringify({ places }, null, 2));
    status.textContent = 'JSON을 클립보드에 복사했습니다.';
  });
})();
