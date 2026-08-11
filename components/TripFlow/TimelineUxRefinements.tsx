'use client';

export default function TimelineUxRefinements() {
  return <style jsx global>{`
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
