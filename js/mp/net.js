/**
 * PeerJS transport. The vendored UMD bundle is loaded on demand only for
 * multiplayer pages; the daily game never downloads it. Signaling uses the
 * public PeerJS cloud; gameplay data stays on the DataChannel.
 */

const PEER_SCRIPT = new URL('../../vendor/peerjs/peerjs.min.js', import.meta.url).href;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let peerLoader = null;

export class SignalingError extends Error {
  constructor(code, message = code, cause = null) {
    super(message);
    this.name = 'SignalingError';
    this.code = code;
    this.cause = cause;
  }
}

export function randomRoomCode(length = 8) {
  const size = Math.max(6, Math.min(12, Number(length) || 8));
  const values = new Uint8Array(size);
  crypto.getRandomValues(values);
  let code = '';
  for (const value of values) code += ROOM_ALPHABET[value % ROOM_ALPHABET.length];
  return code;
}

export function loadPeerConstructor() {
  if (typeof window !== 'undefined' && window.Peer) return Promise.resolve(window.Peer);
  if (typeof document === 'undefined') return Promise.reject(new SignalingError('no-browser'));
  if (peerLoader) return peerLoader;
  peerLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PEER_SCRIPT;
    script.async = true;
    script.onload = () => {
      if (window.Peer) resolve(window.Peer);
      else reject(new SignalingError('peerjs-missing'));
    };
    script.onerror = () => reject(new SignalingError('peerjs-load-failed'));
    document.head.append(script);
  });
  return peerLoader;
}

function closePeer(peer) {
  try {
    peer?.destroy();
  } catch {
    // best effort
  }
}

function waitForPeerOpen(peer, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, id) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(id);
    };
    const timer = setTimeout(() => finish(new SignalingError('signaling-timeout')), timeoutMs);
    peer.on('open', (id) => finish(null, id));
    peer.on('error', (error) => finish(new SignalingError(error?.type || 'signaling-error', error?.message || '', error)));
  });
}

/** Host side. Accepts multiple guests and relays messages. */
export class HostPeer {
  constructor(peer, code) {
    this.peer = peer;
    this.code = code;
    this.peerId = peer.id;
    this.connections = new Map();
    this.handlers = { connection: [], data: [], close: [], error: [] };
    this.closed = false;
    peer.on('connection', (conn) => this.accept(conn));
    peer.on('error', (error) => this.emit('error', error));
  }

  on(event, handler) {
    if (this.handlers[event]) this.handlers[event].push(handler);
    return this;
  }

  emit(event, payload) {
    for (const handler of this.handlers[event] || []) {
      try {
        handler(payload);
      } catch {
        // A UI handler must not break the transport.
      }
    }
  }

  accept(conn) {
    const id = conn.connectionId || conn.peer;
    this.connections.set(id, conn);
    conn.on('open', () => this.emit('connection', { id, conn }));
    conn.on('data', (data) => this.emit('data', { id, conn, data }));
    conn.on('close', () => {
      this.connections.delete(id);
      this.emit('close', { id, conn });
    });
    conn.on('error', (error) => this.emit('error', { id, error }));
  }

  send(id, message) {
    const conn = this.connections.get(id);
    if (!conn || !conn.open) return false;
    try {
      conn.send(message);
      return true;
    } catch {
      return false;
    }
  }

  broadcast(message, exceptId = null) {
    for (const [id, conn] of this.connections) {
      if (id === exceptId || !conn.open) continue;
      try {
        conn.send(message);
      } catch {
        // one slow peer must not stop the room
      }
    }
  }

  disconnect(id) {
    const conn = this.connections.get(id);
    if (!conn) return;
    try {
      conn.close();
    } catch {
      // best effort
    }
    this.connections.delete(id);
  }

  close() {
    this.closed = true;
    for (const conn of this.connections.values()) {
      try {
        conn.close();
      } catch {
        // best effort
      }
    }
    this.connections.clear();
    closePeer(this.peer);
  }
}

/** Guest side: one DataConnection to the host. */
export class GuestPeer {
  constructor(peer, conn) {
    this.peer = peer;
    this.conn = conn;
    this.handlers = { data: [], close: [], error: [] };
    conn.on('data', (data) => this.emit('data', data));
    conn.on('close', () => this.emit('close'));
    conn.on('error', (error) => this.emit('error', error));
  }

  on(event, handler) {
    if (this.handlers[event]) this.handlers[event].push(handler);
    return this;
  }

  emit(event, payload) {
    for (const handler of this.handlers[event] || []) {
      try {
        handler(payload);
      } catch {
        // ignore UI failures
      }
    }
  }

  send(message) {
    if (!this.conn?.open) return false;
    try {
      this.conn.send(message);
      return true;
    } catch {
      return false;
    }
  }

  close() {
    try {
      this.conn?.close();
    } catch {
      // best effort
    }
    closePeer(this.peer);
  }
}

export async function createHost(code, { timeoutMs = 15000 } = {}) {
  const Peer = await loadPeerConstructor();
  const peer = new Peer(`fitdle-${code}`, { debug: 0 });
  try {
    await waitForPeerOpen(peer, timeoutMs);
  } catch (error) {
    closePeer(peer);
    throw error;
  }
  return new HostPeer(peer, code);
}

export async function joinHost(code, { timeoutMs = 20000 } = {}) {
  const Peer = await loadPeerConstructor();
  const peer = new Peer({ debug: 0 });
  try {
    await waitForPeerOpen(peer, timeoutMs);
    const conn = peer.connect(`fitdle-${code}`, {
      reliable: true,
      serialization: 'json',
      metadata: { v: 1 },
    });
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => finish(new SignalingError('connect-timeout')), timeoutMs);
      conn.on('open', () => finish(null));
      conn.on('error', (error) => finish(new SignalingError('connect-failed', error?.message || '', error)));
      peer.on('error', (error) => finish(new SignalingError(error?.type || 'connect-failed', error?.message || '', error)));
    });
    return new GuestPeer(peer, conn);
  } catch (error) {
    closePeer(peer);
    throw error instanceof SignalingError ? error : new SignalingError('connect-failed', '', error);
  }
}
