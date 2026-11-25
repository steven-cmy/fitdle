/**
 * Fitdle localization. Interface strings live in js/messages/<locale>.js, one
 * flat dictionary per language with identical keys. Ship, module, group and
 * description text comes from CCP's SDE data files.
 */

import en from './messages/en.js';
import de from './messages/de.js';
import es from './messages/es.js';
import fr from './messages/fr.js';
import ja from './messages/ja.js';
import ko from './messages/ko.js';
import ru from './messages/ru.js';
import zh from './messages/zh.js';

export const LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'ru', 'zh'];

export const LOCALE_META = {
  en: { label: 'English', intl: 'en-US' },
  de: { label: 'Deutsch', intl: 'de-DE' },
  es: { label: 'Español', intl: 'es-ES' },
  fr: { label: 'Français', intl: 'fr-FR' },
  ja: { label: '日本語', intl: 'ja-JP' },
  ko: { label: '한국어', intl: 'ko-KR' },
  ru: { label: 'Русский', intl: 'ru-RU' },
  zh: { label: '简体中文', intl: 'zh-CN' },
};

export const MESSAGES = { en, de, es, fr, ja, ko, ru, zh };

export function isLocale(locale) {
  return LOCALES.includes(locale);
}

export function resolveLocale(raw) {
  if (!raw) return 'en';
  const lower = String(raw).toLowerCase().replace('_', '-');
  if (isLocale(lower)) return lower;
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('ko')) return 'ko';
  if (lower.startsWith('ru')) return 'ru';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('en')) return 'en';
  return 'en';
}

function localeFromTag(raw) {
  if (!raw) return null;
  // Every zh variant (zh-Hans, zh-Hant, zh-TW, zh-HK, ...) uses the
  // Simplified Chinese catalog in FITDLE.
  if (/^zh(?:[-_]|$)/i.test(String(raw))) return 'zh';
  const resolved = resolveLocale(raw);
  if (resolved !== 'en' || /^en(?:[-_]|$)/i.test(String(raw))) return resolved;
  return null;
}

export function detectLocale() {
  try {
    const stored = localStorage.getItem('fitdle:v1:lang');
    const storedLocale = localeFromTag(stored);
    if (storedLocale) return storedLocale;
  } catch {
    // localStorage can be unavailable in privacy modes
  }
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  for (const candidate of candidates) {
    const resolved = resolveLocale(candidate);
    if (isLocale(resolved)) return resolved;
  }
  return 'en';
}

export function createI18n(locale) {
  const lang = isLocale(locale) ? locale : 'en';
  const messages = MESSAGES[lang] || MESSAGES.en;
  const fallback = MESSAGES.en;
  const intl = LOCALE_META[lang]?.intl || LOCALE_META.en.intl;

  const t = (key, vars = {}) => {
    let value = messages[key] ?? fallback[key] ?? key;
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  };

  const numberFormat = (options = {}) => new Intl.NumberFormat(intl, options);
  const integer = (n) => numberFormat({ maximumFractionDigits: 0 }).format(Number(n) || 0);
  const decimal = (n, digits = 1) => numberFormat({ minimumFractionDigits: 0, maximumFractionDigits: digits }).format(Number(n) || 0);
  const compact = (n) => numberFormat({ notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0);
  const isk = (n) => `${compact(n)} ISK`;
  const iskFull = (n) => `${integer(n)} ISK`;
  const percent = (n) => numberFormat({ maximumFractionDigits: 0 }).format(Number(n) || 0);
  const date = (dateKey) => {
    const d = new Date(`${dateKey}T12:00:00Z`);
    return new Intl.DateTimeFormat(intl, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(d);
  };
  const duration = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return { lang, intl, t, integer, decimal, compact, isk, iskFull, percent, date, duration };
}
