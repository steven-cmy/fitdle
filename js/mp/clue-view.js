/**
 * Clue presentation for the dealer room. Uses the same markup and CSS classes
 * as the daily dossier (attr-row, weight pips, module-line) so the three game
 * surfaces stay visually unified.
 */
import { icon, SLOT_ICON } from '../icons.js';

const CATEGORY_ORDER = ['traits', 'hull', 'nav', 'defense', 'targeting', 'fitting', 'equipment', 'cargo', 'economy'];
const SENSOR_ROWS = [
  ['radar', 'sensor.radar', '#7F6C50'],
  ['gravimetric', 'sensor.gravimetric', '#4A6C7F'],
  ['magnetometric', 'sensor.magnetometric', '#366565'],
  ['ladar', 'sensor.ladar', '#653834'],
];
const DAMAGE_ROWS = [
  ['em', 'damage.em', '#4da3ff'],
  ['thermal', 'damage.thermal', '#ff5a5a'],
  ['kinetic', 'damage.kinetic', '#c3ccd4'],
  ['explosive', 'damage.explosive', '#ffa94d'],
];

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function weightPips(weight, t = (key) => key) {
  const numeric = Number(weight) || 0;
  const lit = numeric <= 0 ? 0 : Math.max(1, Math.min(5, Math.ceil(numeric / 2)));
  const shown = String(Number(numeric.toFixed(2)));
  return `<span class="weight${numeric <= 0 ? ' is-zero' : ''}" title="${esc(t('dossier.signal'))} ${esc(shown)}/10" aria-label="${esc(t('dossier.signal'))} ${esc(shown)}/10">${Array.from({ length: 5 }, (_, i) => `<i class="${i < lit ? 'on' : ''}"></i>`).join('')}</span>`;
}

export function clueLabel(clue, t = (key) => key) {
  return t(`clue.${clue.k === 'cargoCapacity' ? 'cargo' : clue.k}`) || clue.k;
}

function renderResists(value, t) {
  if (!value) return '<span class="big">—</span>';
  return `<div class="resist-cells">${DAMAGE_ROWS.map(([key, label, color]) => {
    const number = Number(value[key]) || 0;
    return `<span class="resist-cell" style="--v:${Math.max(0, Math.min(100, number))}%;--c:${color}">
      <b>${esc(number)}%</b><small>${esc(t(label))}</small>
    </span>`;
  }).join('')}</div>`;
}

function numberValue(value, unit, format, prefix = '') {
  const text = format(value);
  return `<span class="big">${esc(prefix)}${esc(text)}</span>${unit ? `<span class="unit">${esc(unit)}</span>` : ''}`;
}

export function clueValue(clue, ctx) {
  const { t, refs, locale, int, dec, compact, isk, percent } = ctx;
  if (!clue) return '';
  if (clue.missing) return `<span class="big">${esc(t('clue.unavailable'))}</span>`;
  const value = clue.v;
  switch (clue.k) {
    case 'race':
      return `<span class="big">${esc(refs?.races?.[value] || '—')}</span>`;
    case 'faction':
      return `<span class="big">${esc(refs?.factions?.[value] || refs?.races?.[value] || '—')}</span>`;
    case 'group':
      return `<span class="big">${esc(refs?.groups?.[value] || '—')}</span>`;
    case 'meta':
      return `<span class="big">${esc(refs?.metaGroups?.[value] || '—')}</span>`;
    case 'tech':
      return `<span class="big">${esc(t('clue.techValue', { n: int(value) }))}</span>`;
    case 'hiSlots':
    case 'medSlots':
    case 'lowSlots':
    case 'rigSlots':
    case 'turretHardpoints':
    case 'launcherHardpoints':
    case 'maxLockedTargets':
      return `<span class="big">${esc(int(value))}</span>`;
    case 'shieldResists':
    case 'armorResists':
    case 'structureResists':
      return renderResists(value, t);
    case 'drones':
      return `<div class="hardpoint-row">
        <span class="hardpoint">${icon('drone')}${esc(int(value?.bandwidth))}<span>Mbit/s</span></span>
        <span class="hardpoint">${icon('ship')}${esc(int(value?.capacity))}<span>m³</span></span>
      </div>`;
    case 'speed':
      return numberValue(value, 'm/s', int, '≈ ');
    case 'sig':
      return numberValue(value, 'm', int);
    case 'sensorStrength': {
      const sensors = SENSOR_ROWS.filter(([key]) => Number(value?.[key]) > 0);
      if (!sensors.length) return '<span class="big">—</span>';
      return `<span class="sensor-list">${sensors.map(([key, label, color]) => `
        <span class="sensor-line" style="--c:${color}">
          ${icon('radar')}
          <span class="sensor-kind">${esc(t(label))}</span>
          <span class="sensor-value">${esc(int(value[key]))}</span>
        </span>`).join('')}</span>`;
    }
    case 'shieldRecharge':
      return `<span class="big">${esc(dec(value, 2))}</span><span class="unit">s</span>`;
    case 'align':
      return `<span class="big">${esc(dec(value, 1))}</span><span class="unit">s</span>`;
    case 'warp':
      return `<span class="big">${esc(dec(value, 1))}</span><span class="unit">AU/s</span>`;
    case 'mass':
      return `<span class="big">${esc(int(value))}</span><span class="unit">t</span>`;
    case 'cargoCapacity':
      return numberValue(value, 'm³', int);
    case 'shield':
    case 'armor':
    case 'structure':
      return numberValue(value, 'HP', int);
    case 'capacitor':
      return numberValue(value, 'GJ', int);
    case 'pg':
      return numberValue(value, 'MW', int);
    case 'cpu':
      return numberValue(value, 'tf', int);
    case 'calibration':
      return `<span>${esc(int(value))}</span>`;
    case 'targetRange':
      return value >= 10000
        ? `<span class="big">${esc(dec(value / 1000, 1))}</span><span class="unit">km</span>`
        : numberValue(value, 'm', int);
    case 'scanRes':
      return numberValue(value, 'mm', int);
    case 'kbValue':
      return `<span class="big">${esc(isk(value))}</span>`;
    case 'losses30':
      return `<span class="big">≈ ${esc(compact(value))}</span>`;
    case 'usageRank':
      return `<span class="big">${esc(t('clue.rankTop', { n: int(value) }))}</span>`;
    case 'danger':
      return `<span class="big">${esc(percent(value))}%</span>`;
    case 'bonus':
      return '';
    default:
      return `<span class="big">${esc(value ?? '—')}</span>`;
  }
}

function moduleName(clue, refs, locale) {
  const module = refs?.modules?.[clue.v?.module];
  return module?.name || module?.names?.[locale] || `Type #${clue.v?.module}`;
}

function renderModuleLine(clue, ctx) {
  const { refs, locale, int, t } = ctx;
  const tags = [...new Set(clue.tags?.length ? clue.tags : clue.tag ? [clue.tag] : [])];
  const slot = clue.v?.slot || '';
  return `<span class="module-line">
    <span class="module-icon">${icon(SLOT_ICON[slot] || 'target')}</span>
    <span class="module-line-body">
      <span class="module-line-name">${esc(moduleName(clue, refs, locale))}</span>
      ${tags.map((tag) => `<span class="badge-hull badge-${esc(tag)}" title="${esc(t(`dossier.${tag}`))}">${esc(t(`dossier.${tag}`))}</span>`).join('')}
    </span>
    <span class="module-count">×${esc(int(clue.v?.count))}</span>
  </span>`;
}

export function renderClueRow(clue, ctx, { published = false, dealer = false, index = 0 } = {}) {
  const { t, refs, locale, int } = ctx;
  const category = clue.c === 'identity' || clue.c === 'slots' ? (clue.c === 'identity' ? 'hull' : 'fitting') : clue.c;
  const visible = published || dealer;
  let label = clueLabel(clue, t);
  let value = '';
  if (clue.k === 'equipment' || clue.k === 'cargo') {
    label = '';
    value = visible ? renderModuleLine(clue, ctx) : '';
  } else if (clue.k === 'bonus') {
    label = '';
    const text = clue.text?.[locale] || clue.text?.en || t('clue.bonus');
    value = visible ? esc(text) : '';
  } else {
    value = visible ? clueValue(clue, ctx) : '';
  }
  if (visible && !value) value = '—';
  const zeroWeight = (Number(clue.w) || 0) <= 0;
  const button = dealer && !published
    ? `<button type="button" class="mp-publish" data-publish="${esc(index)}" aria-label="${esc(t('mp.dealer.publish'))}">${esc(t('mp.dealer.publish'))}</button>`
    : '';
  return `<div class="attr-row cat-${esc(category)}${clue.k === 'equipment' || clue.k === 'cargo' ? ' equipment-row' : ''}${clue.k === 'bonus' ? ' bonus-row' : ''}${zeroWeight ? ' is-zero-weight' : ''} ${visible ? 'is-revealed' : 'is-hidden'}${dealer && !published ? ' is-unpublished' : ''}" data-clue-index="${esc(index)}" data-clue-kind="${esc(clue.k)}" data-category="${esc(category)}">
    <span class="attr-label">${esc(label)}</span>
    <span class="attr-value">${visible ? value : '<span class="attr-redacted" aria-hidden="true">?</span>'}</span>
    <span class="attr-meta">${visible ? weightPips(clue.w, t) : `<span class="attr-lock">${icon('lock')}</span>`}</span>
    ${button}
  </div>`;
}

export function renderClueList(clues, ctx, { published = new Set(), dealer = false } = {}) {
  const groups = new Map();
  (clues || []).forEach((clue, index) => {
    const category = clue.c === 'identity' ? 'hull' : clue.c === 'slots' ? 'fitting' : clue.c;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push({ clue, index });
  });
  return CATEGORY_ORDER
    .filter((category) => groups.has(category))
    .map((category) => {
      const rows = groups.get(category).map(({ clue, index }) => {
        const clueIndex = Number.isInteger(Number(clue.i)) ? Number(clue.i) : index;
        return renderClueRow(
          clue,
          { ...ctx, index: clueIndex },
          { published: published.has(clueIndex), dealer, index: clueIndex },
        );
      }).join('');
      return `<section class="mp-clue-group">
        <h3 class="mp-clue-cat">${esc(ctx.t(`cat.${category}`) || category)}</h3>
        ${rows}
      </section>`;
    }).join('');
}
