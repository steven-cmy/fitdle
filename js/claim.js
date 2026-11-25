import { cyrb53 } from './game.js';

export const CLAIM_DEPARTMENT_IDS = [
  'salvage',
  'hull',
  'intake',
  'fitting',
  'wreck',
  'cargo',
  'arbitration',
  'compliance',
  'alliance-srp',
  'clone',
  'concord',
  'courier',
];

export function claimSeed({ killId = null, killmailId = null, day = '' } = {}) {
  const value = killId ?? killmailId ?? day ?? 'claim';
  return String(value || 'claim');
}

export function claimGroups(departments, locale) {
  const pool = departments?.[locale];
  if (!Array.isArray(pool)) return [];
  return pool.filter((department) => (
    department
    && typeof department.id === 'string'
    && typeof department.name === 'string'
    && department.name.trim()
    && Array.isArray(department.memos)
  ));
}

function claimIndex(seed, key, length) {
  return cyrb53(`fitdle:claim:${seed}:${key}`) % length;
}

export function pickClaimGroup(groups, seed, preserveId = '') {
  if (!Array.isArray(groups) || !groups.length) return null;
  if (preserveId) {
    const current = groups.find((group) => group.id === preserveId);
    if (current) return current;
  }
  return groups[claimIndex(seed, 'department', groups.length)];
}

export function pickClaimMemo(group, seed) {
  const pool = Array.isArray(group?.memos)
    ? group.memos.filter((memo) => typeof memo === 'string' && memo)
    : [];
  if (!pool.length) return '';
  return pool[claimIndex(seed, `${group.id}:memo`, pool.length)];
}

export function pickClaimDebrief(group, status, seed) {
  if (status !== 'won' && status !== 'lost') return '';
  const pool = Array.isArray(group?.debriefs?.[status])
    ? group.debriefs[status].filter((text) => typeof text === 'string' && text)
    : [];
  if (!pool.length) return '';
  return pool[claimIndex(seed, `${group.id}:debrief:${status}`, pool.length)];
}
