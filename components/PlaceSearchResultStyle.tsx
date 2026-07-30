'use client';

import { useEffect } from 'react';

export default function PlaceSearchResultStyle() {
  useEffect(() => {
    const id = 'tf-place-search-result-style';
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .modal .result > small { display: none !important; }
      .modal .result > h3 { margin-bottom: 5px; }
      .modal .result > p { margin-bottom: 12px; }
    `;
    document.head.appendChild(style);

    return () => style.remove();
  }, []);

  return null;
}
