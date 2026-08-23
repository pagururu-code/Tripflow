'use client';

import { useEffect } from 'react';

function moveSummaryBelowTimeline() {
  const timeline = document.querySelector<HTMLElement>('main > .timeline');
  const summary = document.querySelector<HTMLElement>('main > .summary');
  if (!timeline || !summary || timeline.nextElementSibling === summary) return;
  timeline.after(summary);
}

function moveShareIntoTripsMenu() {
  const shareButton = document.querySelector<HTMLButtonElement>('button[aria-label="여행 내보내기"]');
  if (!shareButton) return;

  const tripsModal = Array.from(document.querySelectorAll<HTMLElement>('.modal')).find(
    modal => modal.querySelector('h2')?.textContent?.trim() === '내 여행',
  );
  if (!tripsModal || tripsModal.querySelector('[data-tripflow-share-menu]')) return;

  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'trip-choice trip-share-menu-choice';
  menuButton.setAttribute('data-tripflow-share-menu', '');

  const title = document.createElement('b');
  title.textContent = '여행 공유';
  const description = document.createElement('small');
  description.textContent = 'PDF · PNG로 저장하고 공유하기';
  menuButton.append(title, description);
  menuButton.addEventListener('click', () => shareButton.click());

  const divider = tripsModal.querySelector('hr');
  if (divider) divider.before(menuButton);
  else tripsModal.appendChild(menuButton);
}

function syncScheduleUx() {
  moveSummaryBelowTimeline();
  moveShareIntoTripsMenu();
}

export default function TimelineUxRefinements() {
  useEffect(() => {
    syncScheduleUx();
    const observer = new MutationObserver(syncScheduleUx);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <style jsx global>{`
    .day-title {
      margin-left: 12px !important;
      margin-bottom: 4px !important;
    }

    .day-title + .timeline {
      padding-top: 8px !important;
    }

    @media (max-width: 520px) {
      .day-title {
        margin-left: 12px !important;
        margin-bottom: 4px !important;
      }

      .day-title + .timeline {
        padding-top: 8px !important;
      }
    }

    .timeline + .summary {
      margin: 2px 0 18px;
    }

    button[aria-label='여행 내보내기'] {
      display: none !important;
    }

    .trip-share-menu-choice {
      text-align: left;
      border-color: rgba(95, 119, 93, .12) !important;
      background: rgba(233, 238, 229, .58) !important;
    }

    .trip-share-menu-choice b,
    .trip-share-menu-choice small {
      display: block;
    }

    .trip-share-menu-choice small {
      margin-top: 4px;
      color: #748078;
    }

    .timeline-subitems {
      gap: 6px;
      margin-top: 9px;
    }

    .timeline-subitem {
      font-size: 13px !important;
      line-height: 1.45 !important;
      color: #536159 !important;
      gap: 8px !important;
    }

    .timeline-subitem:before {
      content: '•' !important;
      color: #7f8c84 !important;
      font-size: 14px;
      line-height: 1.35;
    }

    /* Do not show the fit-to-gap option as soon as an empty slot opens. */
    .tf-timeline-sheet:has(.tf-gap-tabs button:first-child.active) .tf-fit-gap {
      display: none !important;
    }

    /* For place search, reveal it only after there is an actual result to schedule. */
    .tf-timeline-sheet:has(.tf-gap-tabs button:nth-child(2).active):not(:has(.tf-gap-list .tf-gap-item)) .tf-fit-gap {
      display: none !important;
    }
  `}</style>;
}
