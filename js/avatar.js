import { esc } from './mp/clue-view.js';

export const DEFAULT_PORTRAIT_ID = 1;

export function portraitUrl(characterId, size = 64, baseUrl = '') {
  const id = Number(characterId);
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!Number.isSafeInteger(id) || id <= 0 || !base) return '';
  const pixels = [32, 64, 128, 256, 512].includes(Number(size)) ? Number(size) : 64;
  return `${base}/characters/${id}/portrait?size=${pixels}`;
}

export function avatarInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return [...words[0]].slice(0, 2).join('').toUpperCase();
  return words.slice(0, 2).map((word) => [...word][0] || '').join('').toUpperCase();
}

export function avatarHtml(name, characterId, size = 64, className = '', baseUrl = '') {
  const fallbackUrl = portraitUrl(DEFAULT_PORTRAIT_ID, size, baseUrl);
  const url = portraitUrl(characterId, size, baseUrl) || fallbackUrl;
  const extra = className ? ` ${className}` : '';
  return `<span class="avatar${extra}" style="--avatar-size:${Number(size) || 64}px">
    <span class="avatar-fallback" aria-hidden="true">${esc(avatarInitials(name))}</span>
    ${url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback="${esc(fallbackUrl)}" onerror="if(this.dataset.fallback){this.onerror=null;this.src=this.dataset.fallback}">` : ''}
  </span>`;
}
