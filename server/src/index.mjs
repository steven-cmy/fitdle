import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gameDateKey, msUntilNextDowntime } from '../../js/game.js';
import { config } from './config.mjs';
import { cleanupExpired } from './db.mjs';
import { registerAuthRoutes } from './auth.mjs';
import { expireRuns, registerRunRoutes } from './runs.mjs';
import { pruneLimits } from './limits.mjs';
import { evictExpiredRooms, registerRoomRoutes } from './rooms.mjs';
import { pruneTargetCaches } from './targets.mjs';
import { startupLines, startupWarnings } from './startup.mjs';

/** Query strings may hold sign-in codes and room player ids: log the path only. */
const logPath = (request) => String(request.url || '').split('?')[0];

function loggerOptions(logStream) {
  if (process.env.NODE_ENV === 'test' && !logStream) return false;
  return {
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      req: (request) => ({
        method: request.method,
        url: logPath(request),
        host: request.host,
        remoteAddress: request.ip,
      }),
    },
    ...(logStream ? { stream: logStream } : {}),
  };
}

/** Version query of the served release, written by build-dist into index.html. */
function assetVersion() {
  try {
    const html = fs.readFileSync(path.join(config.staticDir, 'index.html'), 'utf8');
    return /\/main\.js\?v=([\w.-]+)/.exec(html)?.[1] || '';
  } catch {
    return '';
  }
}

export async function buildApp({ logStream = null } = {}) {
  const app = Fastify({
    logger: loggerOptions(logStream),
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });
  await app.register(cookie);
  await app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    const origin = String(request.headers.origin || '');
    if (origin && config.allowedOrigins.length && !config.allowedOrigins.includes(origin)) {
      reply.code(403).send({ error: 'origin-not-allowed' });
      return;
    }
    if (origin && config.allowedOrigins.includes(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin, Accept-Encoding');
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Allow-Headers', 'content-type');
      reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }
    if (request.method === 'OPTIONS') {
      reply.code(204).send();
      return;
    }
  });

  app.get('/api/v1/health', async () => ({ ok: true, now: Date.now() }));
  app.get('/api/v1/meta', async () => {
    const now = new Date();
    const day = gameDateKey(now, config.gameDayStartMinutes);
    return {
      serverTime: now.toISOString(),
      gameDay: day,
      gameDayStartMinutes: config.gameDayStartMinutes,
      nextReset: new Date(now.getTime() + msUntilNextDowntime(now, config.gameDayStartMinutes)).toISOString(),
      dataVersion: String(config.manifest?.dataVersion || ''),
      algorithmVersion: config.algorithmVersion,
      ...(config.publicContact ? { contact: config.publicContact } : {}),
      features: { online: true, rooms: true, sso: Boolean(config.eve.clientId) },
      limits: {
        maxPlayers: config.roomMaxPlayers,
        room: {
          arbitrationBigRounds: config.roomArbitrationBigRounds,
          arbitrationBigRoundsMax: config.roomArbitrationMaxBigRounds,
          timedDurationMinutes: config.roomTimedDurationMinutes,
          timedDurationMaxMinutes: config.roomTimedMaxDurationMinutes,
          reconnectGraceMs: config.roomReconnectGraceMs,
        },
      },
    };
  });

  for (const warning of config.warnings) app.log.warn(warning);
  registerAuthRoutes(app);
  registerRunRoutes(app);
  registerRoomRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    request.log?.error?.({ err: error, url: logPath(request) }, 'request failed');
    const status = Number(error.statusCode) || 500;
    reply.code(status).send({ error: status === 500 ? 'internal-error' : error.code || 'request-failed' });
  });

  if (fs.existsSync(config.staticDir)) {
    const version = assetVersion();
    const versioned = new RegExp(`\\.(?:js|css)\\?v=${version.replace(/[.]/g, '\\.')}$`);
    app.addHook('onSend', async (request, reply) => {
      // Only files of exactly this release: their address changes with the content.
      if (version && [200, 304].includes(reply.statusCode) && versioned.test(request.url)) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      }
    });
    await app.register(fastifyStatic, {
      root: config.staticDir,
      prefix: '/',
      index: ['index.html'],
      wildcard: true,
      cacheControl: true,
      maxAge: 0,
      // build-dist writes .br/.gz siblings; HTML has none and is served as is.
      preCompressed: true,
      setHeaders: (response) => response.setHeader('Vary', 'Accept-Encoding'),
    });
  } else {
    app.log.warn(`static directory not found: ${config.staticDir}`);
  }

  const cleanupTimer = setInterval(() => {
    cleanupExpired();
    expireRuns();
    evictExpiredRooms();
    pruneLimits();
    pruneTargetCaches();
  }, 10 * 60 * 1000);
  cleanupTimer.unref?.();
  app.addHook('onClose', async () => clearInterval(cleanupTimer));
  return app;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain || process.env.FITDLE_SERVER_MAIN === '1') {
  const app = await buildApp();
  cleanupExpired();
  expireRuns();
  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(`FITDLE online service listening on ${config.host}:${config.port}`);
    for (const line of startupLines()) app.log.info(line);
    for (const warning of startupWarnings()) app.log.warn(warning);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
  const shutdown = async () => {
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
