import { esc } from './mp/clue-view.js';
import { avatarHtml } from './avatar.js';
import { icon } from './icons.js';

/** One line renders as a paragraph; several lines render as a list. */
function manualBody(text) {
  const lines = String(text).split('\n').filter(Boolean);
  if (lines.length < 2) return `<p>${esc(text)}</p>`;
  return `<ul class="manual-mode-list">${lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`;
}

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
  'kicked',
]);
// Server close codes: taken over by a newer tab, or refused/removed.
const CLOSE_REPLACED = 4001;
const CLOSE_REFUSED = 1008;
const HEARTBEAT_MS = 25_000;
const PONG_TIMEOUT_MS = 15_000;
const RACE_RETRY_MS = 5000;
const HOLD_MS = 900;

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

/** Delay before reconnect attempt `attempt` (0 = first). */
export function reconnectDelay(attempt) {
  return attempt <= 0 ? 0 : Math.min(10_000, 800 * attempt);
}

const region = (name, tag = 'div') => `<${tag} class="room-region" data-region="${name}" style="display:contents"></${tag}>`;

/**
 * Same-page room surface. It intentionally does not own the single-player
 * puzzle; round targets are handed back to the main app.
 *
 * Panels are built once as a skeleton of regions. Updates only touch regions
 * whose markup changed, so the chat input, an open select or a running hold is
 * never replaced by an unrelated room message.
 */
export class RoomSurface {
  constructor({ api, t, refs, catalog, locale, maxPlayers = 8, roomLimits = {}, imagesBase = '', int, onClose, onViewChange, onArbitrationState, onKicked, onEndlessPrepare, onEndlessStart, onEndlessLoaded, onEndlessRoundResult, onRoundEvent, onRaceState, onLeave, onRoomUpdate }) {
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
    this.onClose = onClose;
    this.onViewChange = onViewChange;
    this.onArbitrationState = onArbitrationState;
    this.onKicked = onKicked;
    this.onEndlessPrepare = onEndlessPrepare;
    this.onEndlessStart = onEndlessStart;
    this.onEndlessLoaded = onEndlessLoaded;
    this.onEndlessRoundResult = onEndlessRoundResult;
    this.onRoundEvent = onRoundEvent;
    this.onRaceState = onRaceState;
    this.onLeave = onLeave;
    this.onRoomUpdate = onRoomUpdate;
    this.root = null;
    this.rail = null;
    this.view = null;
    this.reconnectGraceMs = Number(roomLimits.reconnectGraceMs) || 60000;
    this.reconnectStartedAt = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.pingSentAt = 0;
    this.renderFrame = 0;
    this.renderFallback = null;
    this.hold = null;
    // The single-player board was replaced by a room round at least once.
    this.usedBoard = false;
    this.ws = null;
    this.code = '';
    this.playerId = '';
    this.room = null;
    this.dealerClues = null;
    this.dealerScores = null;
    this.dealerTarget = null;
    this.decoyShipIds = [];
    this.arbitrationReveal = null;
    this.autoIndices = new Set();
    this.endless = null;
    this.endlessResult = null;
    this.error = '';
    this.feed = [];
    this.selected = new Set();
    this.chatDraft = '';
    this.chatFocused = false;
    this.autoFollow = true;
    this.chatScrollTop = 0;
    this.pendingChat = null;
    this.pendingChatTimer = null;
    this.race = null;
    this.raceTimer = null;
    this.matchResult = null;
    this.connected = false;
    this.leaving = false;
    this.kicked = false;
    this.reconnectAttempts = 0;
    this.onWake = () => this.checkConnection();
    this.onPointerEnd = () => this.cancelHold();
  }

  // --- Mounting ------------------------------------------------------------

  mount(host = null, railHost = null) {
    this.root = host || this.root || document.querySelector('#room-view');
    this.rail = railHost || this.rail || document.querySelector('#room-rail');
    if (!this.root) return;
    if (!this.root.querySelector('#room-panel')) {
      this.root.innerHTML = '<div class="room-surface" id="room-panel"></div>';
    }
    this.mountRail();
    document.addEventListener('visibilitychange', this.onWake);
    window.addEventListener('online', this.onWake);
    window.addEventListener('pageshow', this.onWake);
    document.addEventListener('pointerup', this.onPointerEnd);
    document.addEventListener('pointercancel', this.onPointerEnd);
    this.update();
  }

  mountRail() {
    if (this.rail && !this.rail.querySelector('#room-panel-rail')) {
      this.rail.innerHTML = '<div class="room-surface room-rail-surface" id="room-panel-rail"></div>';
    }
  }

  attach(host, railHost) {
    const nextRoot = host || document.querySelector('#room-view');
    const nextRail = railHost || document.querySelector('#room-rail');
    if (!nextRoot) return;
    this.rail = nextRail;
    this.mount(nextRoot, nextRail);
  }

  close() {
    this.leaving = true;
    this.cancelHold();
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    clearTimeout(this.pendingChatTimer);
    this.pendingChat = null;
    this.clearRace();
    this.cancelFrame();
    document.removeEventListener('visibilitychange', this.onWake);
    window.removeEventListener('online', this.onWake);
    window.removeEventListener('pageshow', this.onWake);
    document.removeEventListener('pointerup', this.onPointerEnd);
    document.removeEventListener('pointercancel', this.onPointerEnd);
    this.ws?.close();
    if (this.root) {
      this.root.innerHTML = '';
      this.root.hidden = true;
    }
    if (this.rail) {
      this.rail.innerHTML = '';
      this.rail.hidden = true;
    }
    this.view = null;
    this.onClose?.();
  }

  hide() {
    if (this.root) this.root.hidden = true;
    if (this.rail) this.rail.hidden = true;
  }

  show() {
    if (!this.root) this.mount();
    if (this.root) this.root.hidden = false;
    this.update();
  }

  updateLocale(locale, refs) {
    this.locale = locale;
    this.refs = refs || this.refs;
    if (this.root) this.update();
  }

  // --- Views ---------------------------------------------------------------

  setView(view) {
    if (this.view === view) return;
    this.view = view;
    this.onViewChange?.(view);
  }

  syncView() {
    if (!this.root) return;
    const match = this.room?.match;
    if (match?.rule === 'endless') {
      this.root.hidden = true;
      if (this.rail) this.rail.hidden = false;
      this.setView('endless');
      return;
    }
    if (match?.rule === 'arbitration' && this.room.phase === 'playing') {
      this.usedBoard = true;
      this.root.hidden = true;
      if (this.rail) this.rail.hidden = false;
      this.onArbitrationState?.(this.arbitrationContext());
      this.setView('arbitration');
      return;
    }
    this.root.hidden = false;
    if (this.rail) this.rail.hidden = true;
    this.setView(this.room && (this.matchResult || this.room.phase === 'between_matches') ? 'result' : 'lobby');
  }

  arbitrationContext() {
    const room = this.room;
    const match = room?.match;
    const self = this.self();
    return {
      room,
      roomCode: room?.code || '',
      matchId: match?.id || '',
      dealerId: match?.dealerId || '',
      round: match?.round || 1,
      totalRounds: match?.totalRounds || 6,
      bigRound: room?.bigRound || null,
      published: new Set(match?.published || []),
      publishedClues: match?.publishedClues || [],
      dealerClues: this.dealerClues || [],
      guessed: new Set(match?.guessed || []),
      solved: new Set(match?.solved || []),
      acceptingGuesses: Boolean(match?.acceptingGuesses),
      phase: match?.phase || 'dealer',
      prepared: match?.prepared || [],
      players: room?.players || [],
      role: match?.dealerId === this.playerId ? 'dealer' : self?.spectator ? 'spectator' : 'player',
      clueCount: Number(match?.clueCount) || (this.dealerClues?.length || 0),
      clueMeta: match?.clueMeta || [],
      dealerTarget: this.dealerTarget,
      decoyShipIds: match?.decoyShipIds || this.decoyShipIds,
      revealResult: match?.revealResult || this.arbitrationReveal || null,
    };
  }

  activePanel() {
    if (this.rail && !this.rail.hidden) return this.rail.querySelector('#room-panel-rail');
    return this.root?.querySelector('#room-panel');
  }

  // --- Rendering -----------------------------------------------------------

  /** Apply the current state: switch views now, repaint once per frame. */
  update() {
    this.syncView();
    this.invalidate();
    this.onRoomUpdate?.();
  }

  renderRoom() {
    this.update();
  }

  invalidate() {
    if (this.renderFrame) return;
    const run = () => {
      this.cancelFrame();
      this.paint();
    };
    this.renderFrame = requestAnimationFrame(run);
    // Covered or background windows may not produce frames at all.
    this.renderFallback = setTimeout(run, 120);
  }

  cancelFrame() {
    cancelAnimationFrame(this.renderFrame);
    clearTimeout(this.renderFallback);
    this.renderFrame = 0;
  }

  paint() {
    const panel = this.activePanel();
    if (!panel) return;
    const inRail = panel.id === 'room-panel-rail';
    if (!this.room) this.paintLobby(panel);
    else if (inRail) this.paintRail(panel);
    else this.paintRoom(panel);
  }

  /** (Re)build a panel only when its kind or language changes. */
  skeleton(panel, kind, html) {
    const key = `${kind}:${this.locale}`;
    this.bindPanel(panel);
    if (panel.dataset.skeleton === key) return;
    this.cancelHold();
    panel.innerHTML = html();
    panel.dataset.skeleton = key;
  }

  /** Update one region if its markup changed; keep focus on a named control. */
  setRegion(panel, name, html) {
    const host = panel.querySelector(`[data-region="${name}"]`);
    if (!host || host.roomHtml === html) return;
    host.roomHtml = html;
    const active = host.contains(document.activeElement) ? document.activeElement : null;
    const focus = active?.name ? { name: active.name, value: active.value, typing: active.tagName === 'INPUT' } : null;
    host.innerHTML = html;
    if (!focus) return;
    const next = host.querySelector(`[name="${focus.name}"]`);
    if (!next) return;
    if (focus.typing) next.value = focus.value;
    next.focus({ preventScroll: true });
  }

  paintLobby(panel) {
    this.skeleton(panel, 'lobby', () => this.lobbySkeleton());
    this.setRegion(panel, 'error', this.errorHtml());
  }

  paintRoom(panel) {
    const room = this.room;
    this.skeleton(panel, 'room', () => `
      ${region('head')}
      ${region('error')}
      <section class="room-matchbar" data-matchbar>${region('settings')}</section>
      <div class="room-grid">
        <section class="arbitration-board">
          ${this.renderRoomManual()}
          ${region('board')}
        </section>
        ${this.localSkeleton()}
      </div>`);
    const idle = room.phase === 'lobby' || room.phase === 'between_matches';
    const activeCount = room.players.filter((player) => player.connected && !player.spectator).length;
    const canStart = this.owner() && idle && activeCount >= 2;
    this.setRegion(panel, 'head', `
      <header class="room-head">
        <div>
          <div class="mp-kicker">${esc(this.t('room.roomKicker', { code: room.code }))}</div>
          <h2>${esc(this.gameplayLabel(room.gameplay) || this.t('room.noGameplay'))}</h2>
          <p class="room-subtitle">${esc(this.t('room.roomStatus', { active: activeCount, max: this.maxRoomPlayers() }))}</p>
        </div>
        <div class="room-actions room-head-actions">
          <button type="button" class="button primary room-share" data-room-copy>${icon('share')} ${esc(this.t('room.share'))}</button>
          <button type="button" class="button danger room-leave${room.phase === 'playing' ? ' hold-button' : ''}" data-room-leave>${icon('close')} ${esc(this.t('room.leave'))}</button>
        </div>
      </header>`);
    this.setRegion(panel, 'error', this.errorHtml());
    panel.querySelector('[data-matchbar]').style.display = idle ? '' : 'none';
    this.setRegion(panel, 'settings', idle ? this.renderSettings() : '');
    this.syncStartButton(panel, canStart);
    this.setRegion(panel, 'board', `
      ${!this.matchResult && room.phase === 'lobby' ? `<div class="room-briefing">
        <h3>${esc(this.t('room.rules'))}</h3>
        <p>${esc(this.t('room.rulesBody'))}</p>
        <p>${esc(this.t('room.arbitrationRule'))}</p>
      </div>` : ''}
      ${this.matchResult ? this.renderResult(this.matchResult) : ''}`);
    this.paintLocal(panel);
  }

  paintRail(panel) {
    const room = this.room;
    const match = room.match;
    this.skeleton(panel, 'rail', () => `
      ${region('head')}
      ${region('error')}
      ${region('notes')}
      ${this.localSkeleton()}
      <div class="room-rail-actions" data-region="actions"></div>`);
    const isDealer = match?.dealerId === this.playerId;
    this.setRegion(panel, 'head', `
      <div class="room-rail-head">
        <span class="mp-kicker">${esc(this.t('room.roomKicker', { code: room.code }))}</span>
        <strong>${esc(this.gameplayLabel(room.gameplay) || this.t('room.noGameplay'))}</strong>
        ${match ? `<span class="room-note">${esc(match.rule === 'endless'
          ? this.t('room.endlessRound', { round: match.roundNo || 1 })
          : this.t('room.round', { round: match.round || 1, total: match.totalRounds || 6 }))}</span>` : ''}
        <span class="room-capacity">${this.int(room.players.filter((player) => player.connected).length)} / ${this.maxRoomPlayers()}</span>
      </div>`);
    this.setRegion(panel, 'error', this.errorHtml());
    this.setRegion(panel, 'notes', `
      ${match?.rule === 'endless' && match.phase ? `<p class="room-note">${esc(this.t(`room.endlessPhase.${match.phase}`, { ready: match.ready?.length || 0, total: match.activeCount || 0 }))}</p>` : ''}
      ${match?.rule === 'arbitration' && match.phase === 'reveal' ? `<p class="room-note">${esc(this.t('room.phase.reveal'))}</p>` : ''}`);
    this.paintLocal(panel);
    this.setRegion(panel, 'actions', `
      ${match?.rule === 'arbitration' && isDealer && match.phase === 'dealer' ? `<button class="button primary" type="button" data-room-publish>${esc(this.t('room.publishSelected'))}</button>` : ''}
      ${this.owner() && room.phase === 'playing' ? `<button class="button danger hold-button" type="button" data-room-end>${esc(this.t('room.endMatch'))}</button>` : ''}
      <button class="button danger${room.phase === 'playing' ? ' hold-button' : ''}" type="button" data-room-leave>${esc(this.t('room.leave'))}</button>`);
  }

  errorHtml() {
    return this.error ? `<p class="room-error">${esc(this.errorText())}</p>` : '';
  }

  lobbySkeleton() {
    return `
      <header class="room-head">
        <div>
          <div class="mp-kicker">${esc(this.t('room.lobbyKicker'))}</div>
          <h2>${esc(this.t('room.title'))}</h2>
        </div>
        <button type="button" class="button danger" data-room-close>${icon('close')} ${esc(this.t('room.close'))}</button>
      </header>
      ${region('error')}
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
      </div>`;
  }

  renderManualBlocks() {
    return [
      ['help.multiplayerFlowTitle', 'help.multiplayerFlow'],
      ['help.multiplayerRaceTitle', 'help.multiplayerRace'],
      ['help.multiplayerArbitrationTitle', 'help.multiplayerArbitration'],
    ].map(([title, body]) => `
      <div class="manual-mode-block">
        <h4>${esc(this.t(title))}</h4>
        ${manualBody(this.t(body))}
      </div>`).join('');
  }

  renderRoomManual() {
    return `
      <section class="room-list room-manual manual-section">
        <h3>${icon('radar')} ${esc(this.t('room.manualTitle'))}</h3>
        <p>${esc(this.t('help.multiplayerBody'))}</p>
        ${this.renderManualBlocks()}
      </section>`;
  }

  // --- LOCAL: players and chat ---------------------------------------------

  localSkeleton() {
    return `
      <section class="room-local" aria-label="${esc(this.t('room.local'))}">
        <header class="room-local-head" data-region="localHead"></header>
        <ul class="room-local-list" aria-live="polite" data-local-list></ul>
        <div class="room-chat-block">
          <div class="room-chat-head">
            <h4>${esc(this.t('room.chatTitle'))}</h4>
            <label class="room-chat-follow">
              <input type="checkbox" data-chat-follow ${this.autoFollow ? 'checked' : ''}>
              <span>${esc(this.t('room.chatAutoFollow'))}</span>
            </label>
          </div>
          ${region('chatState')}
          <div class="room-chat-log" data-chat-log></div>
          <p class="room-chat-error" data-chat-notice hidden></p>
          <form class="room-chat" data-room-chat>
            <textarea name="message" data-room-chat-input rows="1" maxlength="120" autocomplete="off"
              placeholder="${esc(this.t('room.chatPlaceholder'))}">${esc(this.chatDraft)}</textarea>
            <button class="button primary room-chat-send" type="submit" data-chat-send>
              ${icon('arrowRight')}${esc(this.t('room.send'))}
            </button>
          </form>
        </div>
      </section>`;
  }

  playerRow(player) {
    const room = this.room;
    const dealerId = room.match?.dealerId;
    const roles = [];
    if (player.id === room.ownerId) roles.push(this.t('room.host'));
    if (player.id === this.playerId) roles.push(this.t('room.you'));
    if (player.id === dealerId) roles.push(this.t('room.dealerTag'));
    if (player.spectator) roles.push(this.t('room.spectator'));
    if (!player.connected) roles.push(this.t('room.reconnecting'));
    const ready = room.match?.ready?.includes?.(player.id)
      || room.match?.prepared?.includes?.(player.id)
      || room.match?.finished?.includes?.(player.id);
    return {
      className: `room-player${player.id === dealerId ? ' is-dealer' : ''}${player.id === this.playerId ? ' is-self' : ''}${player.connected ? '' : ' is-reconnecting'}${player.id === room.ownerId ? ' is-host' : ''}${ready ? ' is-ready' : ''}`,
      color: player.color || '#8fd3ff',
      html: `
        <span class="room-presence${player.connected ? ' is-online' : ''}" aria-hidden="true"></span>
        ${avatarHtml(player.name, player.characterId, 32, 'room-avatar', this.imagesBase)}
        <span class="room-pilot">
          <strong>${player.id === room.ownerId ? `<span class="room-host-badge" data-tip="${esc(this.t('room.host'))}" tabindex="0" aria-label="${esc(this.t('room.host'))}">★</span>` : ''}${esc(player.name)}</strong>
          <small>#${esc(this.localId(player.id))}${roles.length ? ` · ${esc(roles.join(' · '))}` : ''}</small>
        </span>
        ${ready ? `<span class="room-ready-dot" role="status" data-tip="${esc(this.t('room.readyHighlight'))}" tabindex="0" aria-label="${esc(this.t('room.readyHighlight'))}"></span>` : ''}
        ${player.connected ? '' : `<span class="room-spinner" role="status" aria-label="${esc(this.t('room.reconnecting'))}"></span>`}
        <span class="room-score">${this.int(player.score || 0)}</span>
        ${this.owner() && player.id !== this.playerId ? `<button type="button" class="room-kick hold-button" data-room-kick="${esc(player.id)}" data-tip="${esc(this.t('room.holdToKick'))}" aria-label="${esc(`${this.t('room.kick')}: ${player.name}`)}">${esc(this.t('room.kick'))}</button>` : ''}`,
    };
  }

  /** Keyed player rows: an unchanged row keeps its node (and a running hold). */
  paintPlayers(list) {
    const existing = new Map([...list.children].map((node) => [node.dataset.playerId, node]));
    this.localPlayers().forEach((player, index) => {
      const row = this.playerRow(player);
      let node = existing.get(player.id);
      existing.delete(player.id);
      if (!node) {
        node = document.createElement('li');
        node.dataset.playerId = player.id;
      }
      if (node.className !== row.className) node.className = row.className;
      if (node.roomColor !== row.color) {
        node.roomColor = row.color;
        node.style.setProperty('--pilot-color', row.color);
      }
      if (node.roomHtml !== row.html) {
        node.roomHtml = row.html;
        node.innerHTML = row.html;
      }
      if (list.children[index] !== node) list.insertBefore(node, list.children[index] || null);
    });
    for (const node of existing.values()) node.remove();
  }

  paintLocal(panel) {
    const room = this.room;
    this.setRegion(panel, 'localHead', `
      <div>
        <span class="mp-kicker">${esc(this.t('room.localKicker'))}</span>
        <strong>LOCAL <em>#${esc(room.code)}</em></strong>
      </div>
      <span class="room-capacity">${room.players.length} / ${this.maxRoomPlayers()}</span>`);
    const list = panel.querySelector('[data-local-list]');
    if (list) this.paintPlayers(list);
    this.setRegion(panel, 'chatState', !this.connected
      ? `<p class="room-chat-unavailable" role="status" aria-live="polite">${esc(this.t('room.chatUnavailable'))}</p>`
      : '');
    this.paintChat(panel);
  }

  paintChat(panel) {
    const input = panel.querySelector('[data-room-chat-input]');
    const send = panel.querySelector('[data-chat-send]');
    if (input) {
      const enabled = this.connected;
      if (input.disabled === enabled) {
        input.disabled = !enabled;
        // Disabling drops the focus; give it back once the link returns.
        if (enabled && this.chatFocused) input.focus({ preventScroll: true });
      }
      if (document.activeElement !== input && input.value !== this.chatDraft) {
        input.value = this.chatDraft;
        this.adjustChatInput(input);
      }
    }
    if (send) send.disabled = !this.connected;
    const follow = panel.querySelector('[data-chat-follow]');
    if (follow && follow.checked !== this.autoFollow) follow.checked = this.autoFollow;
    const log = panel.querySelector('[data-chat-log]');
    if (!log) return;
    const html = this.renderChatLog();
    if (log.roomHtml === html) return;
    log.roomHtml = html;
    log.innerHTML = html;
    log.roomScrolling = true;
    log.scrollTop = this.autoFollow ? log.scrollHeight : this.chatScrollTop;
    setTimeout(() => { log.roomScrolling = false; }, 50);
  }

  renderChatLog() {
    if (!this.feed.length) {
      return `<p class="room-chat-empty">${esc(this.t('room.chatEmpty'))}</p>`;
    }
    return this.feed.map((entry) => {
      if (entry.kind === 'chat') {
        return `<p class="room-chat-line"><strong style="--pilot-color:${esc(entry.color || '#8fd3ff')}">${esc(entry.name)}</strong><span>${esc(entry.text)}</span></p>`;
      }
      return `<p class="room-chat-line is-system">${esc(this.t(entry.key, entry.vars || {}))}</p>`;
    }).join('');
  }

  // --- Events --------------------------------------------------------------

  bindPanel(panel) {
    if (panel.dataset.roomBound) return;
    panel.dataset.roomBound = '1';
    panel.addEventListener('click', (event) => this.onPanelClick(event));
    panel.addEventListener('change', (event) => this.onPanelChange(event, panel));
    panel.addEventListener('submit', (event) => this.onPanelSubmit(event, panel));
    panel.addEventListener('input', (event) => {
      if (!event.target.matches('[data-room-chat-input]')) return;
      this.chatDraft = event.target.value;
      this.adjustChatInput(event.target);
    });
    panel.addEventListener('focusin', (event) => {
      if (event.target.matches('[data-room-chat-input]')) this.chatFocused = true;
    });
    panel.addEventListener('focusout', (event) => {
      // A focus loss caused by disabling the input is not the user leaving it.
      if (event.target.matches('[data-room-chat-input]') && !event.target.disabled) this.chatFocused = false;
    });
    panel.addEventListener('keydown', (event) => this.onPanelKeydown(event));
    panel.addEventListener('keyup', (event) => {
      if (event.key === ' ' || event.key === 'Enter') this.cancelHold();
    });
    panel.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('.hold-button');
      if (!button || (event.button != null && event.button !== 0)) return;
      event.preventDefault();
      this.startHold(button);
    });
    panel.addEventListener('scroll', (event) => {
      const log = event.target;
      if (!log.matches?.('[data-chat-log]') || log.roomScrolling) return;
      this.chatScrollTop = log.scrollTop;
      if (log.scrollHeight - log.scrollTop - log.clientHeight >= 12 && this.autoFollow) {
        this.autoFollow = false;
        const toggle = panel.querySelector('[data-chat-follow]');
        if (toggle) toggle.checked = false;
      }
    }, true);
  }

  onPanelClick(event) {
    const button = event.target.closest('button');
    if (!button || button.classList.contains('hold-button')) return;
    if (button.matches('[data-room-close]')) this.closeLobby();
    else if (button.matches('[data-room-copy]')) this.copyRoomLink(button);
    else if (button.matches('[data-room-reset]')) this.send({ t: 'reset' });
    else if (button.matches('[data-room-publish]')) this.publishSelected();
    else if (button.matches('[data-room-leave]')) this.leaveRoom();
    else if (button.matches('[data-room-start]')) this.startMatch(button.closest('[data-room-settings]'));
  }

  onPanelChange(event, panel) {
    if (event.target.matches('[data-chat-follow]')) {
      const log = panel.querySelector('[data-chat-log]');
      this.autoFollow = event.target.checked;
      if (!log) return;
      if (this.autoFollow) log.scrollTop = log.scrollHeight;
      else this.chatScrollTop = log.scrollTop;
      return;
    }
    const form = event.target.closest('[data-room-settings]');
    if (!form) return;
    const draft = this.readSettings(form);
    const arbitration = form.querySelector('[data-settings-arbitration]');
    const timed = form.querySelector('[data-settings-timed]');
    if (arbitration) arbitration.hidden = draft.gameplay !== 'arbitration';
    if (timed) timed.hidden = draft.gameplay !== 'timed';
    if (draft.gameplay) this.send({ t: 'settings', gameplay: draft.gameplay, settings: draft.settings });
  }

  onPanelSubmit(event, panel) {
    event.preventDefault();
    const form = event.target;
    if (form.matches('[data-room-form="create"]')) {
      this.createRoom(new FormData(form).get('password') || '');
    } else if (form.matches('[data-room-form="join"]')) {
      const data = new FormData(form);
      this.joinRoom(String(data.get('code') || '').trim().toUpperCase(), String(data.get('password') || ''));
    } else if (form.matches('[data-room-chat]')) {
      const input = form.querySelector('[data-room-chat-input]');
      const text = String(input?.value || '').trim().slice(0, 120);
      if (text) this.sendChat(text, panel);
    }
  }

  onPanelKeydown(event) {
    const hold = event.target.closest?.('.hold-button');
    if (hold && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      if (!event.repeat) this.startHold(hold);
      return;
    }
    const input = event.target;
    if (!input.matches?.('[data-room-chat-input]') || event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      input.setRangeText('\n', start, end, 'end');
      this.chatDraft = input.value;
      this.adjustChatInput(input);
      return;
    }
    input.form?.requestSubmit();
  }

  // --- Hold to confirm -----------------------------------------------------

  startHold(button) {
    if (this.hold || button.disabled) return;
    const startedAt = performance.now();
    const cancel = () => this.cancelHold();
    button.addEventListener('pointerleave', cancel);
    button.addEventListener('blur', cancel);
    button.classList.add('is-holding');
    button.style.setProperty('--hold', '0%');
    const interval = setInterval(() => {
      // A repaint may have removed the button; never confirm for a ghost.
      if (!button.isConnected) {
        cancel();
        return;
      }
      const elapsed = performance.now() - startedAt;
      button.style.setProperty('--hold', `${Math.min(100, (elapsed / HOLD_MS) * 100)}%`);
      if (elapsed < HOLD_MS) return;
      cancel();
      this.confirmHold(button);
    }, 30);
    this.hold = { button, interval, cancel };
  }

  cancelHold() {
    if (!this.hold) return;
    const { button, interval, cancel } = this.hold;
    this.hold = null;
    clearInterval(interval);
    button.removeEventListener('pointerleave', cancel);
    button.removeEventListener('blur', cancel);
    button.classList.remove('is-holding');
    button.style.setProperty('--hold', '0%');
  }

  confirmHold(button) {
    if (button.matches('[data-room-kick]')) this.kickPlayer(button.dataset.roomKick);
    else if (button.matches('[data-room-end]')) this.endGame();
    else if (button.matches('[data-room-leave]')) this.leaveRoom();
  }

  // --- Room actions --------------------------------------------------------

  kickPlayer(playerId) {
    if (!this.owner() || !playerId || playerId === this.playerId) return;
    const player = this.room?.players?.find((item) => item.id === playerId);
    if (!player) return;
    this.send({ t: 'kick', playerId });
  }

  prepareForNext() {
    const match = this.room?.match;
    if (!match) return false;
    return this.send({ t: 'prepare', roundId: match.roundId });
  }

  publishSelected() {
    const indices = [...this.selected];
    if (!indices.length && !this.autoIndices?.size) return false;
    const sent = this.send({ t: 'publish', indices });
    if (sent) this.selected.clear();
    return sent;
  }

  endGame() {
    if (!this.owner()) return false;
    return this.send({ t: 'end' });
  }

  leaveRoom() {
    this.send({ t: 'leave' });
    this.close();
    this.onLeave?.();
  }

  /** Leaving the lobby restores the single-player page if a round replaced it. */
  closeLobby() {
    this.close();
    if (this.usedBoard) this.onLeave?.();
  }

  // Round guesses are delivered in order and kept until the server confirmed
  // them, so a dropped connection loses none.
  sendGuess(roundId, shipId) {
    this.raceFor(roundId).guesses.push(shipId);
    if (this.race.guesses.length === 1) this.flushRace();
  }

  /** A timed round ended without the answer. */
  sendLoss(roundId) {
    const race = this.raceFor(roundId);
    race.lost = true;
    if (!race.guesses.length) this.flushRace();
  }

  raceFor(roundId) {
    if (this.race?.roundId !== roundId) {
      this.clearRace();
      this.race = { roundId, guesses: [], lost: false };
    }
    return this.race;
  }

  clearRace() {
    clearTimeout(this.raceTimer);
    this.race = null;
  }

  flushRace(delayMs = 0) {
    clearTimeout(this.raceTimer);
    const { race } = this;
    if (!race || (!race.guesses.length && !race.lost)) return;
    if (delayMs > 0) {
      this.raceTimer = setTimeout(() => this.flushRace(), delayMs);
      return;
    }
    if (race.guesses.length) this.send({ t: 'raceGuess', roundId: race.roundId, shipId: race.guesses[0] });
    else this.send({ t: 'raceResult', roundId: race.roundId, status: 'lost' });
    // Asking again is harmless: the server counts a guess once.
    this.raceTimer = setTimeout(() => this.flushRace(), RACE_RETRY_MS);
  }

  onRaceGuesses(message) {
    if (this.race && this.race.roundId === message.roundId) {
      const confirmed = new Set((message.guesses || []).map(Number));
      this.race.guesses = this.race.guesses.filter((id) => !confirmed.has(Number(id)));
      if (message.status !== 'playing') this.clearRace();
      else this.flushRace(Number(message.retryMs) || 0);
    }
    this.onRaceState?.(message);
  }

  startMatch(form) {
    const draft = this.readSettings(form);
    if (!draft?.gameplay) return;
    this.send({ t: 'settings', gameplay: draft.gameplay, settings: draft.settings });
    this.send({ t: 'start', gameplay: draft.gameplay, settings: draft.settings });
  }

  readSettings(form) {
    if (!form) return null;
    const data = new FormData(form);
    const gameplay = String(data.get('gameplay') || '');
    if (!gameplay) return { gameplay: '', settings: {} };
    const settings = {};
    if (gameplay === 'arbitration') settings.bigRounds = Number(data.get('bigRounds'));
    if (gameplay === 'timed') settings.raceDurationMs = Number(data.get('durationMinutes')) * 60000;
    return { gameplay, settings };
  }

  syncStartButton(panel, canStart) {
    const button = panel.querySelector('[data-room-start]');
    if (button) button.disabled = !(canStart && this.room.gameplay);
  }

  renderSettings() {
    if (!this.owner()) return `<p class="room-note">${esc(this.t('room.waitingHost'))}</p>`;
    const settings = this.room.settings || {};
    const arbitration = this.room.gameplay === 'arbitration';
    const timed = this.room.gameplay === 'timed';
    const maxBigRounds = Math.max(1, this.roomLimits.arbitrationBigRoundsMax);
    const bigRounds = Math.max(1, Math.min(maxBigRounds, Number(settings.bigRounds) || this.roomLimits.arbitrationBigRounds));
    const maxDuration = Math.max(1, this.roomLimits.timedDurationMaxMinutes);
    const durationMinutes = Math.max(1, Math.min(maxDuration,
      Math.round((Number(settings.raceDurationMs) || this.roomLimits.timedDurationMinutes * 60000) / 60000)));
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
            <button class="button primary" type="button" data-room-start disabled>${icon('target')} ${esc(this.t('room.start'))}</button>
            <button class="button ghost" type="button" data-room-reset>${icon('refresh')} ${esc(this.t('room.resetScores'))}</button>
          </div>
        </form>
      </div>`;
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
      </table>`;
  }

  async createRoom(password) {
    try {
      this.applyJoin(await this.api.createRoom({ password }));
    } catch (error) {
      this.error = error.code || error.message;
      this.update();
    }
  }

  async joinRoom(code, password) {
    if (!code) return;
    try {
      this.applyJoin(await this.api.joinRoom(code, { password }));
    } catch (error) {
      this.error = error.code || error.message;
      this.update();
    }
  }

  applyJoin(result) {
    this.code = result.code;
    this.playerId = result.playerId;
    this.room = result.room;
    this.error = '';
    this.leaving = false;
    this.kicked = false;
    this.reconnectAttempts = 0;
    this.reconnectStartedAt = 0;
    this.matchResult = null;
    this.clearRace();
    this.feed = [];
    this.connect();
    this.update();
    const url = new URL(location.href);
    if (url.searchParams.has('room')) {
      url.searchParams.delete('room');
      history.replaceState(null, '', url.toString());
    }
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
      // Clipboard may be unavailable; the code is still in the room header.
    }
  }

  // --- Connection ----------------------------------------------------------

  connect() {
    clearTimeout(this.reconnectTimer);
    const previous = this.ws;
    this.ws = null;
    previous?.close();
    const path = `/api/v1/rooms/${encodeURIComponent(this.code)}/ws?player=${encodeURIComponent(this.playerId)}`;
    const ws = new WebSocket(this.api.wsUrl(path));
    this.ws = ws;
    // Events of a replaced socket must not affect the current connection.
    ws.addEventListener('open', () => {
      if (this.ws !== ws) return;
      this.connected = true;
      this.reconnectAttempts = 0;
      this.reconnectStartedAt = 0;
      this.error = '';
      this.startHeartbeat();
      this.update();
    });
    ws.addEventListener('close', (event) => {
      if (this.ws === ws) this.onSocketClosed(event.code);
    });
    ws.addEventListener('message', (event) => {
      if (this.ws !== ws) return;
      this.pingSentAt = 0;
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.onMessage(message);
    });
  }

  onSocketClosed(closeCode) {
    this.ws = null;
    this.connected = false;
    this.stopHeartbeat();
    if (this.leaving || this.kicked || !this.code || !this.playerId) {
      this.update();
      return;
    }
    if (closeCode === CLOSE_REPLACED || closeCode === CLOSE_REFUSED) {
      this.exitToLobby('room-error');
      return;
    }
    if (!this.reconnectStartedAt) this.reconnectStartedAt = Date.now();
    if (Date.now() - this.reconnectStartedAt >= this.reconnectGraceMs) {
      this.exitToLobby('room-error');
      return;
    }
    const delay = reconnectDelay(this.reconnectAttempts);
    // A drop that heals on the first attempt needs no error banner.
    if (this.reconnectAttempts > 0) this.error = 'reconnecting';
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => this.reconnect(), delay);
    this.update();
  }

  reconnect() {
    if (this.leaving || this.kicked || !this.root || !this.code) return;
    this.connect();
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  stopHeartbeat() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.pingSentAt = 0;
  }

  /** Application-level ping: keeps proxies from closing an idle connection. */
  heartbeat() {
    if (this.pingSentAt && Date.now() - this.pingSentAt >= PONG_TIMEOUT_MS) {
      this.dropConnection();
      return;
    }
    if (this.send({ t: 'ping' }) && !this.pingSentAt) this.pingSentAt = Date.now();
  }

  /** The peer stopped answering: abandon this socket and reconnect now. */
  dropConnection() {
    const ws = this.ws;
    this.onSocketClosed(0);
    ws?.close();
  }

  /** The page became visible or the network returned. */
  checkConnection() {
    if (document.hidden || !this.code || !this.room || this.leaving || this.kicked) return;
    if (this.ws?.readyState === 1) {
      const sentAt = Date.now();
      if (this.send({ t: 'ping' }) && !this.pingSentAt) this.pingSentAt = sentAt;
      setTimeout(() => {
        if (this.pingSentAt && this.pingSentAt <= sentAt) this.heartbeat();
      }, PONG_TIMEOUT_MS);
    } else if (this.ws?.readyState !== 0) {
      this.connect();
    }
  }

  /** The seat is gone (refused, replaced or timed out): back to the lobby. */
  exitToLobby(error) {
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.connected = false;
    this.code = '';
    this.playerId = '';
    this.room = null;
    this.matchResult = null;
    this.clearRace();
    this.clearArbitration();
    this.endless = null;
    this.feed = [];
    this.error = error;
    this.update();
  }

  send(message) {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  // --- Messages ------------------------------------------------------------

  clearArbitration() {
    this.dealerClues = null;
    this.dealerScores = null;
    this.dealerTarget = null;
    this.decoyShipIds = [];
    this.arbitrationReveal = null;
    this.autoIndices = new Set();
    this.selected.clear();
  }

  onMessage(message) {
    switch (message.t) {
      case 'pong':
        return;
      case 'welcome':
        this.playerId = String(message.selfId || this.playerId);
        this.room = message.room;
        this.error = '';
        if (this.room?.match?.rule === 'endless') this.flushRace();
        break;
      case 'room':
        this.room = message.room;
        break;
      case 'dealerClues':
        this.dealerClues = message.clues || [];
        this.dealerScores = message.scores || null;
        this.dealerTarget = message.dealerTarget || null;
        this.arbitrationReveal = null;
        this.decoyShipIds = message.decoyShipIds || this.decoyShipIds || [];
        this.autoIndices = new Set(message.autoIndices || []);
        break;
      case 'start':
        this.clearArbitration();
        this.decoyShipIds = message.decoyShipIds || [];
        break;
      case 'endlessPrepare':
        this.onPrepare(message);
        break;
      case 'endlessStart':
        this.onEndlessStart?.(message);
        break;
      case 'endlessLoaded':
        this.endless = { ...(this.endless || {}), phase: 'ready', ...message };
        this.onEndlessLoaded?.(message);
        break;
      case 'endlessRoundResult':
        this.endlessResult = message.result;
        this.clearRace();
        this.onEndlessRoundResult?.(message.result);
        break;
      case 'endlessFinished':
        if (message.forfeit) {
          this.pushFeed({ key: 'room.feed.forfeit', vars: { name: String(message.name || '') } });
        } else if (message.status === 'won') {
          this.pushFeed({ key: 'room.feed.solved', vars: { name: this.playerName(message.playerId) } });
        }
        this.onRoundEvent?.(message);
        break;
      case 'raceGuesses':
        this.onRaceGuesses(message);
        return;
      case 'arbitrationRoundResult':
      case 'arbitrationRoundStart':
        this.onRoundEvent?.(message);
        break;
      case 'arbitrationReveal':
        this.arbitrationReveal = message.result || null;
        break;
      case 'arbitrationClueBatch':
        this.pushFeed({ key: 'room.feed.intelBatch', vars: { count: Number(message.count) || 0 } });
        break;
      case 'solved':
        this.pushFeed({ key: 'room.feed.solved', vars: { name: this.playerName(message.playerId) } });
        break;
      case 'miss':
        this.pushFeed({ key: 'room.feed.miss', vars: { name: this.playerName(message.playerId) } });
        break;
      case 'chat':
        this.pushFeed({ kind: 'chat', name: this.playerName(message.from), color: this.playerColor(message.from), text: String(message.text || '') });
        // Chat changes nothing but the log.
        this.invalidate();
        return;
      case 'chat-ack':
        this.onChatAck(String(message.id || ''));
        return;
      case 'chat-error':
        this.onChatError(String(message.id || ''), String(message.code || ''));
        return;
      case 'kicked':
        this.kicked = true;
        this.exitToLobby('kicked');
        this.onKicked?.();
        return;
      case 'matchResult':
        this.clearArbitration();
        this.endless = null;
        this.clearRace();
        this.matchResult = message.result;
        break;
      case 'error':
        this.error = String(message.code || 'room-error');
        break;
      default:
        break;
    }
    this.update();
  }

  onPrepare(message) {
    this.endless = message;
    this.endlessResult = null;
    this.usedBoard = true;
    if (message.submitted || this.race?.roundId !== message.roundId) this.clearRace();
    Promise.resolve(this.onEndlessPrepare?.(message)).then(() => {
      this.send({ t: 'ready', roundId: message.roundId });
    }).catch(() => {
      this.error = 'round-load-failed';
      this.update();
    });
  }

  pushFeed(entry) {
    this.feed.push(entry);
    if (this.feed.length > 80) this.feed.splice(0, this.feed.length - 80);
  }

  playerName(id) {
    const player = this.room?.players?.find((item) => item.id === id);
    return player?.name || `#${shortPilotId(id)}`;
  }

  playerColor(id) {
    const player = this.room?.players?.find((item) => item.id === id);
    return player?.color || '#8fd3ff';
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
    if (this.error === 'kicked') return this.t('room.kicked');
    const key = `room.error.${this.error}`;
    const text = this.t(key);
    if (text !== key) return text;
    return ERROR_CODES.has(this.error) ? text : this.t('room.error.room-error');
  }

  // --- Chat ----------------------------------------------------------------

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
    const panel = this.activePanel();
    const notice = panel?.querySelector('[data-chat-notice]');
    if (notice) notice.hidden = true;
    panel?.querySelector('[data-chat-send]')?.classList.remove('is-error', 'is-shaking');
    const input = panel?.querySelector('[data-room-chat-input]');
    if (input && input.value.trim() === text) {
      this.chatDraft = '';
      input.value = '';
      this.adjustChatInput(input);
      input.focus();
    }
  }

  onChatError(id, code) {
    if (this.pendingChat && this.pendingChat.id !== id) return;
    this.chatFailed(this.activePanel(), code);
  }

  chatFailed(panel, code = '') {
    const currentPanel = panel || this.activePanel();
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
}
