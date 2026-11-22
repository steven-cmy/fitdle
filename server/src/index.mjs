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
import { registerRunRoutes } from './runs.mjs';
import { registerRoomRoutes } from './rooms.mjs';

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL || 'info' },
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });
  await app.register(cookie);
  await app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
  });

  app.addHook('onRequest', async (request, reply) => {
    const origin = String(request.headers.origin || '');
    if (origin && config.allowedOrigins.length && !config.allowedOrigins.includes(origin)) {
      reply.code(403).send({ error: 'origin-not-allowed' });
      return;
    }
    if (origin && config.allowedOrigins.includes(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
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
      nextReset: new Date(now.getTime() + msUntilNextDowntime(now, config.gameDayStartMinutes)).toISOString(),
      dataVersion: String(config.manifest?.dataVersion || ''),
      algorithmVersion: config.algorithmVersion,
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

  registerAuthRoutes(app);
  registerRunRoutes(app);
  registerRoomRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    request.log?.error?.({ err: error, url: request.url }, 'request failed');
    const status = Number(error.statusCode) || 500;
    reply.code(status).send({ error: status === 500 ? 'internal-error' : error.code || 'request-failed' });
  });

  if (fs.existsSync(config.staticDir)) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      prefix: '/',
      index: ['index.html'],
      wildcard: true,
      cacheControl: true,
      maxAge: 0,
    });
  } else {
    app.log.warn(`static directory not found: ${config.staticDir}`);
  }

  const cleanupTimer = setInterval(() => cleanupExpired(), 10 * 60 * 1000);
  cleanupTimer.unref?.();
  app.addHook('onClose', async () => clearInterval(cleanupTimer));
  return app;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain || process.env.FITDLE_SERVER_MAIN === '1') {
  const app = await buildApp();
  cleanupExpired();
  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(`FITDLE online service listening on ${config.host}:${config.port}`);
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
