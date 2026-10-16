import type { JSX } from 'preact';

const paths: Record<string, JSX.Element> = {
  today: <><circle cx="12" cy="12" r="8.25" /><path d="M12 7.5V12l3 2" /></>,
  log: <><path d="M5 6.5h14M5 12h14M5 17.5h9" /></>,
  progress: <><path d="M4 19.5h16" /><path d="M5 15l4.5-4.5 3.5 3L19 7.5" /></>,
  plan: <><circle cx="12" cy="12" r="8.25" /><circle cx="12" cy="12" r="4.25" /><circle cx="12" cy="12" r=".6" fill="currentColor" /></>,
  more: <><circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.75" cy="10.75" r="6.25" /><path d="M15.5 15.5L20 20" /></>,
  barcode: <><path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4H7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M20 17v1.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17" /><path d="M8 8v8M11 8v8M13.5 8v8M16 8v8" /></>,
  quick: <><path d="M13 3.5L6 13.5h5.5L10.5 20.5 18 10h-5.5z" /></>,
  chat: <><path d="M5 5.5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5v-3.5H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth="2.2" /></>,
  scale: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9.5a4.5 4.5 0 0 1 6 0" /><path d="M12 9.5l1-1.5" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  forward: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  star: <path d="M12 4.5l2.3 4.9 5.2.6-3.9 3.6 1.1 5.2L12 16.2l-4.7 2.6 1.1-5.2-3.9-3.6 5.2-.6z" />,
  trash: <><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h2" /></>,
  edit: <><path d="M5 19h4L19 9l-4-4L5 15z" /></>,
  camera: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" /><circle cx="12" cy="13" r="3.25" /></>,
  image: <><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M20 15.5l-4.5-4.5L7 19" /></>,
  clipboard: <><rect x="6" y="5" width="12" height="15" rx="2" /><path d="M9.5 3.5h5v3h-5z" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
  water: <path d="M12 4s6 6.5 6 10.5a6 6 0 0 1-12 0C6 10.5 12 4 12 4z" />,
  book: <><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" /></>,
  food: <><path d="M7 4v7M5 4v4a2 2 0 0 0 4 0V4M7 11v9" /><path d="M16.5 20V4c-2 0-3.5 2.5-3.5 6s1.5 4 3.5 4" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4L6 18M18 18l-1.6-1.6M7.6 7.6L6 6" /></>,
  download: <><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19.5h14" /></>,
  upload: <><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" /><path d="M5 19.5h14" /></>,
  info: <><circle cx="12" cy="12" r="8.25" /><path d="M12 11v5M12 8h.01" /></>,
  lock: <><rect x="5.5" y="10.5" width="13" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  ruler: <><path d="M4 16.5L16.5 4 20 7.5 7.5 20z" /><path d="M8 12.5l1.5 1.5M10.5 10l1.5 1.5M13 7.5l1.5 1.5" /></>,
  leaf: <><path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14z" /><path d="M5 19l7-7" /></>,
  chevron: <path d="M9.5 6l6 6-6 6" />,
  down: <path d="M6 9.5l6 6 6-6" />,
  note: <><path d="M6 4h9l4 4v12H6z" /><path d="M9 12h7M9 16h5" /></>,
  history: <><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" /><path d="M4.5 4.5V9H9" /><path d="M12 8v4l2.5 1.5" /></>,
};

export function Icon({ name, size, class: cls, filled }: { name: keyof typeof paths | string; size?: number; class?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size ?? 22} height={size ?? 22} class={cls} aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
