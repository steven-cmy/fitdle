let API_BASE = (() => {
  try {
    const value = globalThis.__FITDLE_API_BASE__;
    return value ? String(value).replace(/\/$/, '') : '';
  } catch {
    return '';
  }
})();

function url(path) {
  return `${API_BASE}${path}`;
}

async function request(path, { method = 'GET', body = null, timeoutMs = 20000 } = {}) {
  const response = await fetch(url(path), {
    method,
    credentials: 'include',
    headers: body == null ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.error || `http-${response.status}`);
    error.status = response.status;
    error.code = payload?.error || '';
    throw error;
  }
  return payload;
}

export const api = {
  base: API_BASE,
  setBase(value) {
    API_BASE = String(value || '').replace(/\/$/, '');
    api.base = API_BASE;
  },
  me: () => request('/api/v1/auth/me', { timeoutMs: 4000 }),
  meta: () => request('/api/v1/meta', { timeoutMs: 4000 }),
  loginUrl(returnTo = location.pathname + location.search + location.hash) {
    return url(`/api/v1/auth/eve/start?return=${encodeURIComponent(returnTo)}`);
  },
  logout: () => request('/api/v1/auth/logout', { method: 'POST' }),
  daily: () => request('/api/v1/online/daily', { timeoutMs: 60000 }),
  start: (gameplay) => request('/api/v1/online/start', { method: 'POST', body: { gameplay }, timeoutMs: 60000 }),
  custom: (gameplay, kb) => request('/api/v1/online/custom', { method: 'POST', body: { gameplay, kb }, timeoutMs: 60000 }),
  finish: (runId, payload) => request(`/api/v1/online/runs/${encodeURIComponent(runId)}/finish`, { method: 'POST', body: payload }),
  run: (runId) => request(`/api/v1/online/runs/${encodeURIComponent(runId)}`),
  createRoom: (body) => request('/api/v1/rooms', { method: 'POST', body }),
  joinRoom: (code, body) => request(`/api/v1/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body }),
  room: (code) => request(`/api/v1/rooms/${encodeURIComponent(code)}`),
  wsUrl: (path) => {
    if (API_BASE) {
      const base = new URL(API_BASE, location.href);
      base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${base.origin}${path}`;
    }
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}${path}`;
  },
};
