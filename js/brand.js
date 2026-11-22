import { esc } from './mp/clue-view.js';

export const PEND_INSURANCE_ID = 1000113;
export const SCC_ID = 1000132;
export const FITDLE_SYSTEM_LONG = 'F.I.T.D.L.E. // FITTING IDENTIFICATION, TESTIMONY & DAMAGE LEDGER EVALUATION';

export function fitdleMark() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M13 8h27l11 11v37H13Z" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M40 8v11h11" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".7"/>
    <path d="M23 24v25M23 24h17M23 35h13" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M23 49h17" stroke="var(--photon-accent, #5ee6ff)" stroke-width="1.4"/>
  </svg>`;
}

export function corporationLogoUrl(corporationId, baseUrl = '', size = 256) {
  const id = Number(corporationId);
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!Number.isSafeInteger(id) || id <= 0 || !base) return '';
  const pixels = [64, 128, 256, 512].includes(Number(size)) ? Number(size) : 256;
  return `${base}/corporations/${id}/logo?size=${pixels}`;
}

export function brandLogoHtml({ corporationId = PEND_INSURANCE_ID, baseUrl = '', size = 256, className = '', alt = '', fallback = 'PI' }) {
  const url = corporationLogoUrl(corporationId, baseUrl, size);
  const extra = className ? ` ${className}` : '';
  return `<span class="brand-emblem${extra}" style="--brand-size:${Number(size) || 256}px">
    <span class="brand-emblem-fallback" aria-hidden="true">${esc(fallback)}</span>
    ${url ? `<img src="${esc(url)}" alt="${esc(alt)}" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
  </span>`;
}
