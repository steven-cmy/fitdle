/**
 * Application identification for third-party APIs, for example
 * "FITDLE/1.2.3 (contact; +site; +repository)".
 */
export function buildUserAgent({ version = 'dev', repo = '', contact = '', site = '' } = {}) {
  const details = [contact, site ? `+${site}` : '', repo ? `+${repo}` : ''].filter(Boolean).join('; ');
  return `FITDLE/${version || 'dev'}${details ? ` (${details})` : ''}`;
}

/**
 * Origin of a public deployment, or '' for local and private addresses. Browsers
 * already send it as the Origin of every cross-site request.
 */
export function publicSite(location) {
  const host = String(location?.hostname || '').toLowerCase();
  const isPublicName = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)
    && !/^[\d.]+$/.test(host)
    && !/\.(local|localhost|lan|home|internal|test|arpa)$/.test(host);
  return isPublicName && /^https?:$/.test(location.protocol) ? String(location.origin) : '';
}

/** A contact must be safe inside a header comment: short printable ASCII. */
export function parseContact(value) {
  const contact = String(value ?? '').trim();
  if (!contact) return '';
  if (contact.length > 100 || !/^[\x21-\x7e][\x20-\x7e]*$/.test(contact) || /[()<>;\\"]/.test(contact)) {
    throw new Error('API_CONTACT must be a short ASCII contact such as an email address');
  }
  return contact;
}
