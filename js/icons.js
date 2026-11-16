/** Inline line icons. No external icon font or network request. */
const PATHS = {
  crosshair: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><path d="M12 9v6M9 12h6"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3l7 3v6c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V6Z"/><path d="M9 12l2 2 4-4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 3.2 2.5c-.9.4-1.2 1-1.2 2"/><path d="M12 17h.01"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 3 2.6 15 0 18M12 3c-2.6 3-2.6 15 0 18"/>',
  chevron: '<path d="M8 10l4 4 4-4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.7l7.6-4.4M8.2 13.3l7.6 4.4"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="1"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M7 14h2M11 14h2M15 14h2M7 18h2M11 18h2"/>',
  ship: '<path d="M12 3l2 4 5 2-2 8-5 4-5-4-2-8 5-2Z"/><path d="M12 7v11M7 9l10 6M17 9L7 15"/>',
  slots: '<rect x="3" y="4" width="18" height="5"/><rect x="3" y="15" width="18" height="5"/><path d="M6 6.5h.01M6 17.5h.01"/>',
  navigation: '<path d="M12 3l7 18-7-4-7 4Z"/><path d="M12 7v10"/>',
  defense: '<path d="M12 3l7 3v6c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V6Z"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0-5.2 5.2L4 17l3 3 5.3-5.3a4 4 0 0 0 5.2-5.2l-2.3 2.3-2.7-2.7Z"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M9 8h4a3 3 0 0 1 0 6H9V8ZM9 14v3M12 5v2M12 17v2"/>',
  star: '<path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9Z"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l7-4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M16 16l4 4"/>',
  arrowRight: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  alert: '<path d="M12 3l9 18H3Z"/><path d="M12 9v5M12 17h.01"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  turret: '<path d="M5 19h14M7 19v-5h10v5M10 14l2-9 2 9M9 9h6"/>',
  launcher: '<path d="M4 18l6-6M14 4l6 6-9 9-6-6Z"/><path d="M15 3l6 6"/>',
  drone: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><rect x="8" y="8" width="8" height="8" transform="rotate(45 12 12)"/>',
  rig: '<path d="M5 5h14v14H5Z"/><path d="M8 5v14M16 5v14M5 9h14M5 15h14"/><circle cx="12" cy="12" r="2"/>',
  database: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M14 9l2 2"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5Z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L3 10M3 5v5h5M4 13a8 8 0 0 0 14 4l3-3M21 19v-5h-5"/>',
  pin: '<path d="M12 21s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  cut: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 8l12 12M8 16L20 4"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  cargo: '<path d="M4 7h16v13H4z"/><path d="M4 7l3-3h10l3 3M9 11h6"/>',
};

export function icon(name, className = '') {
  const path = PATHS[name] || PATHS.dot;
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export const CATEGORY_ICON = {
  identity: 'crosshair',
  hull: 'ship',
  slots: 'slots',
  nav: 'navigation',
  defense: 'defense',
  fitting: 'wrench',
  equipment: 'target',
  cargo: 'cargo',
  economy: 'coin',
  traits: 'star',
};

export const SLOT_ICON = {
  high: 'turret',
  mid: 'shield',
  low: 'wrench',
  rig: 'rig',
  subsystem: 'layers',
  drone: 'drone',
  fighter: 'launcher',
};
