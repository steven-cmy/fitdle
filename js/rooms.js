import { renderClueList, esc } from './mp/clue-view.js';
import { avatarHtml } from './avatar.js';
import { icon } from './icons.js';

const GAMEPLAY_KEYS = ['standard', 'audit', 'timed', 'arbitration'];
const ERROR_CODES = new Set([
  'room-not-found',
  'wrong-password',
  'room-full',
  'login-required',
  'clue-required',
  'need-players',
  'rule-required',
  'target',
  'room-error',
  'chat-rate-limit',
]);

export function shortPilotId(id, peers = []) {
  const raw = String(id || '').replace(/-/g, '').toUpperCase();
  const others = peers.map((peer) => String(peer || '').replace(/-/g, '').toUpperCase());
  let length = 8;
  while (length < raw.length && others.some((other) => other !== raw && other.slice(0, length) === raw.slice(0, length))) {
    length += 2;
  }
  return raw.slice(0, length) || '????????';
}

export function sortLocalPlayers(players = [], ownerId = '') {
  return [...players].sort((a, b) => {
    const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (scoreDiff) return scoreDiff;
    const nameDiff = String(a.name || '').localeCompare(String(b.name || ''));
    if (nameDiff) return nameDiff;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

/**
 * Same-page room surface. It intentionally does not own the single-player
 * puzzle; race targets are handed back to the main app.
 */
export class RoomSurface {
  constructor({ api, t, refs, catalog, locale, maxPlayers = 8, roomLimits = {}, imagesBase = '', int, onRaceTarget, onClose }) {
    this.api = api;
    this.t = t;
    this.refs = refs;
    this.catalog = catalog;
    this.locale = locale;
    this.maxPlayers = Number(maxPlayers) || 8;
    this.imagesBase = String(imagesBase || '');
    this.roomLimits = {
      arbitrationBigRounds: Number(roomLimits.arbitrationBigRounds) || 1,
      arbitrationBigRoundsMax: Number(roomLimits.arbitrationBigRoundsMax) || 5,
      timedDurationMinutes: Number(roomLimits.timedDurationMinutes) || 10,
      timedDurationMaxMinutes: Number(roomLimits.timedDurationMaxMinutes) || 60,
    };
    this.int = int || ((value) => String(value));
    this.onRaceTarget = onRaceTarget;
    this.onClose = onClose;
    this.root = null;
    this.ws = null;
    this.code = '';
    this.playerId = '';
    this.room = null;
    this.dealerClues = null;
    this.error = '';
    this.feed = [];
    this.selected = new Set();
    this.chatDraft = '';
    this.chatFocused = false;
    this.autoFollow = true;
    this.chatScrollTop = 0;
    this.pendingChat = null;
    this.pendingChatTimer = null;
    this.roomClockTimer = null;
    this.matchResult = null;
    this.connected = false;
    this.leaving = false;
    this.reconnectAttempts = 0;
  }

  mount() {
    this.root = document.createElement('div');
    this.root.id = 'room-surface';
    this.root.className = 'room-overlay';
    this.root.innerHTML = '<div class="room-surface" id="room-panel"></div>';
    document.body.append(this.root);
    this.renderLobby();
  }

  close() {
    this.leaving = true;
    this.ws?.close();
    clearTimeout(this.pendingChatTimer);
    this.pendingChat = null;
    clearInterval(this.roomClockTimer);
    this.root?.remove();
    this.root = null;
    this.onClose?.();
  }

  hide() {
    if (this.root) this.root.hidden = true;
  }

  show() {
    if (!this.root) this.mount();
    this.root.hidden = false;
    this.renderRoom();
  }

  updateLocale(locale, refs) {
    this.locale = locale;
    this.refs = refs || this.refs;
    if (!this.root) return;
    if (this.room) this.renderRoom();
    else this.renderLobby();
  }

  connect() {
    this.ws?.close();
    const path = `/api/v1/rooms/${encodeURIComponent(this.code)}/ws?player=${encodeURIComponent(this.playerId)}`;
    const ws = new WebSocket(this.api.wsUrl(path));
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.error = '';
      this.renderRoom();
    });
    ws.addEventListener('close', () => {
      this.connected = false;
      if (!this.leaving && this.code && this.playerId && this.reconnectAttempts < 5) {
        this.reconnectAttempts += 1;
        this.error = 'reconnecting';
        this.renderRoom();
        setTimeout(() => {
          if (!this.leaving && this.root) this.connect();
        }, 1800 * this.reconnectAttempts);
      } else {
        this.renderRoom();
      }
    });
    ws.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.onMessage(message);
    });
  }

  send(message) {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  onMessage(message) {
    if (message.t === 'welcome') {
      this.playerId = String(message.selfId || this.playerId);
      this.room = message.room;
      this.error = '';
      this.renderRoom();
      return;
    }
    if (message.t === 'room') {
      this.room = message.room;
      this.renderRoom();
      return;
    }
    if (message.t === 'dealerClues') {
      this.dealerClues = message.clues || [];
      this.room ||= {};
      this.renderRoom();
      return;
    }
    if (message.t === 'target') {
      this.onRaceTarget?.(message);
      return;
    }
    if (message.t === 'clue') {
      this.pushFeed({ key: 'room.feed.intel' });
      this.renderRoom();
      return;
    }
    if (message.t === 'solved') {
      this.pushFeed({ key: 'room.feed.solved', vars: { name: this.playerName(message.playerId) } });
      this.renderRoom();
      return;
    }
    if (message.t === 'miss') {
      this.pushFeed({ key: 'room.feed.miss', vars: { name: this.playerName(message.playerId) } });
      this.renderRoom();
      return;
    }
    if (message.t === 'chat') {
      this.pushFeed({ kind: 'chat', name: this.playerName(message.from), text: String(message.text || '') });
      this.renderRoom();
      return;
    }
    if (message.t === 'chat-ack') {
      this.onChatAck(String(message.id || ''));
      return;
    }
    if (message.t === 'chat-error') {
      this.onChatError(String(message.id || ''), String(message.code || ''));
      return;
    }
    if (message.t === 'matchResult') {
      this.matchResult = message.result;
      this.dealerClues = null;
      this.selected.clear();
      this.renderRoom();
      return;
    }
    if (message.t === 'tick') {
      this.renderRoom();
      return;
    }
    if (message.t === 'error') {
      this.error = String(message.code || 'room-error');
      this.renderRoom();
    }
  }

  pushFeed(entry) {
    this.feed.push(entry);
    if (this.feed.length > 80) this.feed.splice(0, this.feed.length - 80);
  }

  playerName(id) {
    const player = this.room?.players?.find((item) => item.id === id);
    return player?.name || `#${shortPilotId(id)}`;
  }

  localId(id) {
    return shortPilotId(id, (this.room?.players || []).map((player) => player.id));
  }

  localPlayers() {
    return sortLocalPlayers(this.room?.players || [], this.room?.ownerId || '');
  }

  self() {
    return this.room?.players?.find((player) => player.id === this.playerId) || null;
  }

  owner() {
    return this.room?.ownerId === this.playerId;
  }

  maxRoomPlayers() {
    return Number(this.room?.maxPlayers) || this.maxPlayers;
  }

  gameplayLabel(gameplay) {
    return this.t(`gameplay.${gameplay}`) === `gameplay.${gameplay}`
      ? String(gameplay || '').toUpperCase()
      : this.t(`gameplay.${gameplay}`);
  }

  errorText() {
    if (!this.error) return '';
    if (this.error === 'reconnecting') return this.t('room.error.reconnecting');
    const key = `room.error.${this.error}`;
    const text = this.t(key);
    if (text !== key) return text;
    return ERROR_CODES.has(this.error) ? text : this.t('room.error.room-error');
  }

  renderChatLog() {
    if (!this.feed.length) {
      return `<p class="room-chat-empty">${esc(this.t('room.chatEmpty'))}</p>`;
    }
    return this.feed.map((entry) => {
      if (entry.kind === 'chat') {
        return `<p class="room-chat-line"><strong>${esc(entry.name)}</strong><span>${esc(entry.text)}</span></p>`;
      }
      return `<p class="room-chat-line is-system">${esc(this.t(entry.key, entry.vars || {}))}</p>`;
    }).join('');
  }

  sendChat(text, panel) {
    const message = String(text || '').trim();
    if (!message) return;
    if (!this.connected || this.ws?.readyState !== 1) {
      this.chatFailed(panel);
      return;
    }
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.pendingChat = { id, text: message };
    clearTimeout(this.pendingChatTimer);
    if (!this.send({ t: 'chat', id, text: message })) {
      this.chatFailed(panel);
      return;
    }
    this.pendingChatTimer = setTimeout(() => {
      if (this.pendingChat?.id === id) this.chatFailed(null);
    }, 5000);
  }

  onChatAck(id) {
    if (!this.pendingChat || this.pendingChat.id !== id) return;
    const { text } = this.pendingChat;
    clearTimeout(this.pendingChatTimer);
    this.pendingChat = null;
    const panel = this.root?.querySelector('#room-panel');
    const notice = panel?.querySelector('[data-chat-notice]');
    if (notice) notice.hidden = true;
    panel?.querySelector('[data-chat-send]')?.classList.remove('is-error', 'is-shaking');
    const input = panel?.querySelector('[data-room-chat-input]');
    if (input && input.value === text) {
      this.chatDraft = '';
      input.value = '';
      this.adjustChatInput(input);
      input.focus();
    }
  }

  onChatError(id, code) {
    if (this.pendingChat && this.pendingChat.id !== id) return;
    const panel = this.root?.querySelector('#room-panel');
    this.chatFailed(panel, code);
  }

  chatFailed(panel, code = '') {
    const currentPanel = panel || this.root?.querySelector('#room-panel');
    clearTimeout(this.pendingChatTimer);
    this.pendingChat = null;
    const button = currentPanel?.querySelector('[data-chat-send]');
    if (button) {
      button.classList.remove('is-error', 'is-shaking');
      void button.offsetWidth;
      button.classList.add('is-error', 'is-shaking');
      setTimeout(() => button.classList.remove('is-shaking', 'is-error'), 1200);
    }
    const notice = currentPanel?.querySelector('[data-chat-notice]');
    if (notice) {
      notice.textContent = code === 'chat-rate-limit'
        ? this.t('room.error.chat-rate-limit')
        : this.t('room.chatFailed');
      notice.hidden = false;
    }
  }

  adjustChatInput(input) {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
  }

  setupChatLog(panel) {
    const log = panel?.querySelector('[data-chat-log]');
    if (!log) return;
    log.scrollTop = this.autoFollow ? log.scrollHeight : this.chatScrollTop;
    let programmatic = true;
    requestAnimationFrame(() => { programmatic = false; });
    log.addEventListener('scroll', () => {
      if (programmatic) return;
      this.chatScrollTop = log.scrollTop;
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 12;
      if (!atBottom && this.autoFollow) {
        this.autoFollow = false;
        const toggle = panel.querySelector('[data-chat-follow]');
        if (toggle) toggle.checked = false;
      }
    });
    const toggle = panel.querySelector('[data-chat-follow]');
    toggle?.addEventListener('change', () => {
      this.autoFollow = toggle.checked;
      if (this.autoFollow) log.scrollTop = log.scrollHeight;
      else this.chatScrollTop = log.scrollTop;
    });
  }

  updateRoomClock() {
    const clock = this.root?.querySelector('[data-room-clock]');
    if (!clock) return;
    const endsAt = Number(this.room?.match?.endsAt);
    if (!endsAt) {
      clock.textContent = '';
      return;
    }
    const remaining = Math.max(0, endsAt - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    clock.textContent = this.t('room.timeLeft', { time: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` });
  }

  setupRoomClock(panel) {
    clearInterval(this.roomClockTimer);
    this.roomClockTimer = null;
    const clock = panel?.querySelector('[data-room-clock]');
    if (!clock || !Number(this.room?.match?.endsAt)) return;
    this.updateRoomClock();
    this.roomClockTimer = setInterval(() => this.updateRoomClock(), 1000);
  }

  renderLobby() {
    const panel = this.root?.querySelector('#room-panel');
    if (!panel) return;
    panel.innerHTML = `
      <header class="room-head">
        <div>
          <div class="mp-kicker">${esc(this.t('room.lobbyKicker'))}</div>
          <h2>${esc(this.t('room.title'))}</h2>
        </div>
        <button type="button" class="button danger" data-room-close>${icon('close')} ${esc(this.t('room.close'))}</button>
      </header>
      ${this.error ? `<p class="room-error">${esc(this.errorText())}</p>` : ''}
      <div class="room-grid">
        <section class="room-list room-lobby-forms">
          <div class="room-list-head">
            <h3>${esc(this.t('room.createRoom'))} / ${esc(this.t('room.joinRoom'))}</h3>
            <span class="room-capacity">${esc(this.t('room.capacity', { max: this.maxPlayers }))}</span>
          </div>
          <div class="room-lobby-grid">
            <form class="room-lobby-card" data-room-form="create">
              <div class="room-card-head">
                <span class="mp-kicker">${esc(this.t('room.createRoom'))}</span>
                <strong>${esc(this.t('room.createRoom'))}</strong>
              </div>
              <label class="room-field">
                <span>${esc(this.t('room.password'))}</span>
                <input name="password" placeholder="${esc(this.t('room.passwordOptional'))}" maxlength="64">
              </label>
              <button class="button primary" type="submit">${icon('arrowRight')} ${esc(this.t('room.create'))}</button>
            </form>
            <form class="room-lobby-card" data-room-form="join">
              <div class="room-card-head">
                <span class="mp-kicker">${esc(this.t('room.joinRoom'))}</span>
                <strong>${esc(this.t('room.joinRoom'))}</strong>
              </div>
              <label class="room-field">
                <span>${esc(this.t('room.code'))}</span>
                <input name="code" placeholder="${esc(this.t('room.codePlaceholder'))}" maxlength="12" required>
              </label>
              <label class="room-field">
                <span>${esc(this.t('room.password'))}</span>
                <input name="password" placeholder="${esc(this.t('room.password'))}" maxlength="64">
              </label>
              <button class="button primary" type="submit">${icon('arrowRight')} ${esc(this.t('room.join'))}</button>
            </form>
          </div>
        </section>
        <aside class="room-list room-rules">
          <h3>${esc(this.t('room.rules'))}</h3>
          <p>${esc(this.t('room.rulesBody'))}</p>
          <p>${esc(this.t('room.arbitrationRule'))}</p>
        </aside>
      </div>
    `;
    panel.querySelector('[data-room-close]')?.addEventListener('click', () => this.close());
    panel.querySelector('[data-room-form="create"]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.createRoom(new FormData(event.target).get('password') || '');
    });
    panel.querySelector('[data-room-form="join"]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      this.joinRoom(String(data.get('code') || '').trim().toUpperCase(), String(data.get('password') || ''));
    });
  }

  async createRoom(password) {
    try {
      const result = await this.api.createRoom({ password });
      this.applyJoin(result);
    } catch (error) {
      this.error = error.code || error.message;
      this.renderLobby();
    }
  }

  async joinRoom(code, password) {
    if (!code) return;
    try {
      const result = await this.api.joinRoom(code, { password });
      this.applyJoin(result);
    } catch (error) {
      this.error = error.code || error.message;
      this.renderLobby();
    }
  }

  applyJoin(result) {
    this.code = result.code;
    this.playerId = result.playerId;
    this.room = result.room;
    this.error = '';
    this.connect();
    this.renderRoom();
  }

  async copyRoomLink(button = null) {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('mode', 'multiplayer');
    url.searchParams.set('room', this.code);
    try {
      await navigator.clipboard.writeText(url.toString());
      if (button) {
        const original = button.innerHTML;
        button.innerHTML = `${icon('check')} ${esc(this.t('room.copied'))}`;
        setTimeout(() => { button.innerHTML = original; }, 1500);
      }
    } catch {
      // Clipboard may be unavailable; the URL is still in the room header.
    }
  }

  renderLocal() {
    const room = this.room;
    const players = this.localPlayers();
    const max = this.maxRoomPlayers();
    const dealerId = room.match?.dealerId;
    return `
      <section class="room-local" aria-label="${esc(this.t('room.local'))}">
        <header class="room-local-head">
          <div>
            <span class="mp-kicker">${esc(this.t('room.localKicker'))}</span>
            <strong>LOCAL <em>#${esc(room.code)}</em></strong>
          </div>
          <span class="room-capacity">${players.length} / ${max}</span>
        </header>
        <ul class="room-local-list" aria-live="polite">
          ${players.map((player) => {
            const roles = [];
            if (player.id === room.ownerId) roles.push(this.t('room.host'));
            if (player.id === this.playerId) roles.push(this.t('room.you'));
            if (player.id === dealerId) roles.push(this.t('room.dealerTag'));
            if (player.spectator) roles.push(this.t('room.spectator'));
            if (!player.connected) roles.push(this.t('room.offline'));
            return `
              <li class="room-player${player.id === dealerId ? ' is-dealer' : ''}${player.id === this.playerId ? ' is-self' : ''}">
                <span class="room-presence${player.connected ? ' is-online' : ''}" aria-hidden="true"></span>
                ${avatarHtml(player.name, player.characterId, 32, 'room-avatar', this.imagesBase)}
                <span class="room-pilot">
                  <strong>${esc(player.name)}</strong>
                  <small>#${esc(this.localId(player.id))}${roles.length ? ` · ${esc(roles.join(' · '))}` : ''}</small>
                </span>
                <span class="room-score">${this.int(player.score || 0)}</span>
              </li>
            `;
          }).join('')}
        </ul>
        <div class="room-chat-block">
          <div class="room-chat-head">
            <h4>${esc(this.t('room.chatTitle'))}</h4>
            <label class="room-chat-follow">
              <input type="checkbox" data-chat-follow ${this.autoFollow ? 'checked' : ''}>
              <span>${esc(this.t('room.chatAutoFollow'))}</span>
            </label>
          </div>
          ${!this.connected ? `<p class="room-chat-unavailable" role="status" aria-live="polite">${esc(this.t('room.chatUnavailable'))}</p>` : ''}
          <div class="room-chat-log" data-chat-log>${this.renderChatLog()}</div>
          <p class="room-chat-error" data-chat-notice hidden></p>
          <form class="room-chat" data-room-chat>
            <textarea name="message" data-room-chat-input rows="1" maxlength="120" autocomplete="off"
              placeholder="${esc(this.t('room.chatPlaceholder'))}" ${this.connected ? '' : 'disabled'}>${esc(this.chatDraft)}</textarea>
            <button class="button primary room-chat-send" type="submit" data-chat-send ${this.connected ? '' : 'disabled'}>
              ${icon('arrowRight')}${esc(this.t('room.send'))}
            </button>
          </form>
        </div>
        <div class="room-actions">
          ${this.owner() && room.phase === 'playing' ? `<button class="button danger" type="button" data-room-end>${icon('close')} ${esc(this.t('room.endMatch'))}</button>` : ''}
        </div>
      </section>
    `;
  }

  renderRoom() {
    const panel = this.root?.querySelector('#room-panel');
    if (!panel) return;
    if (!this.room) {
      this.renderLobby();
      return;
    }
    const previousLog = panel.querySelector('[data-chat-log]');
    if (previousLog) this.chatScrollTop = previousLog.scrollTop;
    const room = this.room;
    const match = room.match;
    const playing = room.phase === 'playing';
    const arbitration = match?.rule === 'arbitration';
    const race = match?.rule === 'race';
    const isDealer = arbitration && match.dealerId === this.playerId;
    const canStart = this.owner() && ['lobby', 'between_matches'].includes(room.phase)
      && room.players.filter((player) => player.connected && !player.spectator).length >= 2;
    const settlement = this.matchResult;
    const published = new Set(match?.published || []);
    const ctx = {
      t: this.t,
      refs: this.refs,
      locale: this.locale,
      int: this.int,
      dec: (value) => Number(value).toFixed(1),
      compact: (value) => String(value),
      isk: (value) => String(value),
      percent: (value) => String(value),
    };
    const dealerClueRows = isDealer && this.dealerClues
      ? renderClueList(this.dealerClues, ctx, { published, dealer: true })
      : '';
    const publishedRows = !isDealer && match?.publishedClues
      ? renderClueList(match.publishedClues, ctx, { published: new Set(match.publishedClues.map((clue) => clue.i)), dealer: false })
      : '';
    const activeCount = room.players.filter((player) => player.connected && !player.spectator).length;
    panel.innerHTML = `
      <header class="room-head">
        <div>
          <div class="mp-kicker">${esc(this.t('room.roomKicker', { code: room.code }))}</div>
          <h2>${esc(this.gameplayLabel(room.gameplay) || this.t('room.noGameplay'))}</h2>
          <p class="room-subtitle">${esc(this.t('room.roomStatus', { active: activeCount, max: this.maxRoomPlayers() }))}
            <span class="room-clock" data-room-clock></span>
          </p>
        </div>
        <div class="room-actions room-head-actions">
          <button type="button" class="button primary room-share" data-room-copy>${icon('share')} ${esc(this.t('room.share'))}</button>
          <button type="button" class="button danger room-leave" data-room-leave>${icon('close')} ${esc(this.t('room.leave'))}</button>
        </div>
      </header>
      ${this.error ? `<p class="room-error">${esc(this.errorText())}</p>` : ''}
      ${room.phase === 'lobby' || room.phase === 'between_matches' ? `<section class="room-matchbar">${this.renderSettings(canStart)}</section>` : ''}
      <div class="room-grid">
        <section class="arbitration-board">
          ${!settlement && room.phase === 'lobby' ? `<div class="room-briefing">
            <h3>${esc(this.t('room.rules'))}</h3>
            <p>${esc(this.t('room.rulesBody'))}</p>
            <p>${esc(this.t('room.arbitrationRule'))}</p>
          </div>` : ''}
          ${settlement ? this.renderResult(settlement) : ''}
          ${race && playing ? `<p class="room-note">${esc(this.t('room.raceActive'))}</p>` : ''}
          ${arbitration ? `
            <div class="mp-room-meta">
              <span>${esc(this.t('room.round', { round: Number(match.round) || 1, total: Number(match.totalRounds) || 6 }))}</span>
              ${room.bigRound ? `<span>${esc(this.t('room.bigRound', { number: Number(room.bigRound.number) || 1, total: Number(room.bigRound.total) || 1 }))}</span>` : ''}
              <span>${esc(this.t('room.dealerLine', { name: this.playerName(match.dealerId) }))}</span>
            </div>
            <h3>${esc(isDealer ? this.t('room.fullIntel') : this.t('room.publishedIntel'))}</h3>
            <div class="arbitration-clues">${isDealer ? dealerClueRows : publishedRows || `<p class="room-note">${esc(this.t('room.noClues'))}</p>`}</div>
            ${isDealer && !match.acceptingGuesses ? `<div class="arbitration-actions">
              <button class="button primary" type="button" data-room-publish>${esc(this.t('room.publishSelected'))}</button>
              <span class="room-note">${esc(this.t('room.publishHint'))}</span>
            </div>` : ''}
            ${!isDealer && match.acceptingGuesses && !match.solved?.includes(this.playerId)
              ? `<form class="arbitration-actions" data-room-guess>
                  <input name="guess" placeholder="${esc(this.t('room.guessPlaceholder'))}" maxlength="120" autocomplete="off">
                  <button class="button primary" type="submit">${esc(this.t('room.guess'))}</button>
                </form>`
              : ''}
            ${match.solved?.includes(this.playerId) ? `<p class="room-note">${esc(this.t('room.solvedSpectating'))}</p>` : ''}
          ` : ''}
          ${room.phase === 'playing' && race ? `<p class="room-note">${esc(this.t('room.racePuzzle'))}</p>` : ''}
        </section>
        ${this.renderLocal()}
      </div>
    `;
    panel.querySelector('[data-room-copy]')?.addEventListener('click', (event) => this.copyRoomLink(event.currentTarget));
    panel.querySelector('[data-room-leave]')?.addEventListener('click', () => {
      this.send({ t: 'leave' });
      this.close();
    });
    panel.querySelector('[data-room-reset]')?.addEventListener('click', () => this.send({ t: 'reset' }));
    panel.querySelector('[data-room-end]')?.addEventListener('click', () => this.send({ t: 'end' }));
    panel.querySelector('[data-room-publish]')?.addEventListener('click', () => {
      const indices = [...this.selected];
      if (indices.length) {
        this.send({ t: 'publish', indices });
        this.selected.clear();
      }
    });
    panel.querySelectorAll('[data-publish-index]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const index = Number(checkbox.dataset.publishIndex);
        if (checkbox.checked) this.selected.add(index);
        else this.selected.delete(index);
      });
    });
    panel.querySelector('[data-room-guess]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = String(new FormData(event.target).get('guess') || '').trim();
      if (value) this.send({ t: 'guess', text: value });
    });
    const settingsForm = panel.querySelector('[data-room-settings]');
    const readSettings = () => {
      if (!settingsForm) return null;
      const data = new FormData(settingsForm);
      const gameplay = String(data.get('gameplay') || '');
      if (!gameplay) return { gameplay: '', settings: {} };
      const settings = {};
      if (gameplay === 'arbitration') settings.bigRounds = Number(data.get('bigRounds'));
      if (gameplay === 'timed') settings.raceDurationMs = Number(data.get('durationMinutes')) * 60000;
      return { gameplay, settings };
    };
    const syncSettings = () => {
      const draft = readSettings();
      if (!draft) return;
      const arbitration = settingsForm.querySelector('[data-settings-arbitration]');
      const timed = settingsForm.querySelector('[data-settings-timed]');
      if (arbitration) arbitration.hidden = draft.gameplay !== 'arbitration';
      if (timed) timed.hidden = draft.gameplay !== 'timed';
      const hint = settingsForm.querySelector('[data-settings-hint]');
      if (hint) hint.hidden = Boolean(draft.gameplay);
      const start = panel.querySelector('[data-room-start]');
      if (start) start.disabled = !canStart || !draft.gameplay;
    };
    const sendSettings = () => {
      const draft = readSettings();
      if (draft?.gameplay) this.send({ t: 'settings', gameplay: draft.gameplay, settings: draft.settings });
    };
    settingsForm?.addEventListener('submit', (event) => event.preventDefault());
    settingsForm?.querySelector('[data-settings-gameplay]')?.addEventListener('change', () => {
      syncSettings();
      sendSettings();
    });
    for (const selector of ['[name="bigRounds"]', '[name="durationMinutes"]']) {
      settingsForm?.querySelector(selector)?.addEventListener('change', sendSettings);
    }
    panel.querySelector('[data-room-start]')?.addEventListener('click', () => {
      const draft = readSettings();
      if (!draft?.gameplay) return;
      this.send({ t: 'settings', gameplay: draft.gameplay, settings: draft.settings });
      this.send({ t: 'start', gameplay: draft.gameplay, settings: draft.settings });
    });
    const chat = panel.querySelector('[data-room-chat]');
    chat?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = event.target.querySelector('[data-room-chat-input]');
      const text = String(input?.value || '').trim().slice(0, 120);
      if (text) this.sendChat(text, panel);
    });
    const chatInput = panel.querySelector('[data-room-chat-input]');
    chatInput?.addEventListener('input', () => {
      this.chatDraft = chatInput.value;
      this.adjustChatInput(chatInput);
    });
    chatInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const start = chatInput.selectionStart ?? chatInput.value.length;
        const end = chatInput.selectionEnd ?? start;
        chatInput.setRangeText('\n', start, end, 'end');
        this.chatDraft = chatInput.value;
        this.adjustChatInput(chatInput);
        return;
      }
      event.preventDefault();
      chat?.requestSubmit();
    });
    chatInput?.addEventListener('focus', () => { this.chatFocused = true; });
    chatInput?.addEventListener('blur', () => { this.chatFocused = false; });
    if (chatInput) {
      this.adjustChatInput(chatInput);
      if (this.chatFocused) {
        chatInput.focus();
        chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
      }
    }
    this.setupChatLog(panel);
    this.setupRoomClock(panel);
    if (isDealer) this.attachPublishCheckboxes(panel, published);
  }

  attachPublishCheckboxes(panel, published) {
    const rows = panel.querySelectorAll('.attr-row[data-clue-index]');
    rows.forEach((row) => {
      const index = Number(row.dataset.clueIndex);
      if (published.has(index)) return;
      const label = row.querySelector('.attr-label');
      if (!label) return;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.publishIndex = String(index);
      label.prepend(checkbox);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) this.selected.add(index);
        else this.selected.delete(index);
      });
    });
  }

  renderSettings(canStart) {
    if (!this.owner()) return `<p class="room-note">${esc(this.t('room.waitingHost'))}</p>`;
    const settings = this.room.settings || {};
    const arbitration = this.room.gameplay === 'arbitration';
    const timed = this.room.gameplay === 'timed';
    const maxBigRounds = Math.max(1, this.roomLimits.arbitrationBigRoundsMax);
    const bigRounds = Math.max(1, Math.min(maxBigRounds, Number(settings.bigRounds) || this.roomLimits.arbitrationBigRounds));
    const maxDuration = Math.max(1, this.roomLimits.timedDurationMaxMinutes);
    const durationMinutes = Math.max(1, Math.min(maxDuration,
      Math.round((Number(settings.raceDurationMs) || this.roomLimits.timedDurationMinutes * 60000) / 60000)));
    const canStartNow = canStart && Boolean(this.room.gameplay);
    return `
      <div class="room-settings-card">
        <div class="room-settings-head">
          <div>
            <h3>${esc(this.t('room.matchSettings'))}</h3>
          </div>
          <span class="room-note" data-settings-hint ${this.room.gameplay ? 'hidden' : ''}>${esc(this.t('room.chooseFirst'))}</span>
        </div>
        <form data-room-settings class="room-settings">
          <div class="room-settings-grid">
            <label class="room-field">
              <span>${esc(this.t('room.gameplay'))}</span>
              <select name="gameplay" data-settings-gameplay>
                <option value=""${this.room.gameplay ? '' : ' selected'}>${esc(this.t('room.selectGameplay'))}</option>
                ${GAMEPLAY_KEYS.map((gameplay) => `<option value="${gameplay}"${this.room.gameplay === gameplay ? ' selected' : ''}>${esc(this.gameplayLabel(gameplay))}</option>`).join('')}
              </select>
            </label>
            <label class="room-field" data-settings-arbitration ${arbitration ? '' : 'hidden'}>
              <span>${esc(this.t('room.bigRounds'))}</span>
              <select name="bigRounds">
                ${Array.from({ length: maxBigRounds }, (_, index) => index + 1).map((value) => `<option value="${value}"${value === bigRounds ? ' selected' : ''}>${value}</option>`).join('')}
              </select>
              <small>${esc(this.t('room.bigRoundsHelp', { max: maxBigRounds }))}</small>
            </label>
            <label class="room-field" data-settings-timed ${timed ? '' : 'hidden'}>
              <span>${esc(this.t('room.duration'))}</span>
              <input name="durationMinutes" type="number" min="1" max="${maxDuration}" step="1" value="${durationMinutes}" inputmode="numeric">
              <small>${esc(this.t('room.durationHelp', { max: maxDuration }))}</small>
            </label>
          </div>
          <div class="room-settings-actions">
            <button class="button primary" type="button" data-room-start ${canStartNow ? '' : 'disabled'}>${icon('target')} ${esc(this.t('room.start'))}</button>
            <button class="button ghost" type="button" data-room-reset>${icon('refresh')} ${esc(this.t('room.resetScores'))}</button>
          </div>
        </form>
      </div>
    `;
  }

  renderResult(result) {
    const scores = result.scores || {};
    return `
      <h3>${esc(this.t('room.matchResult'))}</h3>
      <p>${esc(result.rule === 'arbitration' ? this.t('room.targetRevealed') : this.t('room.raceFinished'))}</p>
      <table class="room-score-table">
        <thead><tr><th>${esc(this.t('room.pilot'))}</th><th>${esc(this.t('room.score'))}</th></tr></thead>
        <tbody>
          ${this.localPlayers().map((player) => `<tr>
            <td>${esc(player.name)} <small>#${esc(this.localId(player.id))}</small></td>
            <td>${this.int(scores[player.id] ?? player.score ?? 0)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;
  }
}
