import { loadEnv } from './lib/loadEnv.js';
loadEnv();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  EventInputSchema,
  RegisterRequestSchema,
  type EventListResponse,
  type EventResponse,
  type MeResponse,
  type RegistrationListResponse,
} from '@app/shared';
import { InitDataError, validateInitData, type ValidatedInitData } from './lib/validateInitData.js';
import {
  createEvent,
  deleteEvent,
  getDb,
  getEvent,
  listEvents,
  listRegistrations,
  registerForEvent,
  unregisterFromEvent,
  updateEvent,
} from './lib/db.js';
import { createNotifier } from './lib/notify.js';
import { createSheetsExporter } from './lib/sheets.js';

declare module 'fastify' {
  interface FastifyRequest {
    initData?: ValidatedInitData;
  }
}

const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const API_PORT = Number.parseInt(process.env.API_PORT ?? '3001', 10);
const ALLOWED_ORIGINS = (process.env.API_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const ORGANIZER_IDS = new Set<number>(
  (process.env.ORGANIZER_TELEGRAM_IDS ?? '')
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0),
);

const PUBLIC_ROUTES = new Set<string>(['/health']);

function isOrganizer(userId: number): boolean {
  return ORGANIZER_IDS.has(userId);
}

async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  const notifier = createNotifier({
    botToken: BOT_TOKEN,
    organizerIds: ORGANIZER_IDS,
    logger: app.log,
  });

  const sheets = createSheetsExporter({ logger: app.log });
  if (sheets.enabled) {
    app.log.info({}, 'Google Sheets export enabled');
  }

  await app.register(cors, {
    origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : false,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data'],
  });

  app.addHook('onRequest', async (request, reply) => {
    const url = request.routeOptions?.url ?? request.url.split('?')[0] ?? request.url;
    if (PUBLIC_ROUTES.has(url)) {
      return;
    }
    if (request.method === 'OPTIONS') {
      return;
    }

    const header = request.headers['x-telegram-init-data'];
    const initData = Array.isArray(header) ? header[0] : header;
    if (!initData) {
      reply.code(401).send({ error: 'unauthorized', message: 'X-Telegram-Init-Data is required' });
      return reply;
    }

    if (!BOT_TOKEN) {
      reply.code(500).send({ error: 'server_misconfigured', message: 'BOT_TOKEN is not set' });
      return reply;
    }

    try {
      request.initData = validateInitData(initData, BOT_TOKEN);
    } catch (err) {
      const code = err instanceof InitDataError ? err.code : 'invalid_init_data';
      const message = err instanceof Error ? err.message : 'invalid initData';
      reply.code(401).send({ error: code, message });
      return reply;
    }
    return;
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/me', async (request, reply): Promise<MeResponse> => {
    const data = request.initData;
    if (!data) {
      reply.code(401).send({ error: 'unauthorized' });
      return reply as never;
    }
    const response: MeResponse = {
      user: data.user,
      authDate: data.authDate,
      isOrganizer: isOrganizer(data.user.id),
    };
    return response;
  });

  app.get('/events', async (request, reply): Promise<EventListResponse> => {
    const data = request.initData;
    if (!data) {
      reply.code(401).send({ error: 'unauthorized' });
      return reply as never;
    }
    const all = (request.query as { all?: string })?.all === '1' && isOrganizer(data.user.id);
    return { events: listEvents(data.user.id, { upcomingOnly: !all }) };
  });

  app.get<{ Params: { id: string } }>(
    '/events/:id',
    async (request, reply): Promise<EventResponse> => {
      const data = request.initData;
      if (!data) {
        reply.code(401).send({ error: 'unauthorized' });
        return reply as never;
      }
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        reply.code(400).send({ error: 'bad_id' });
        return reply as never;
      }
      const event = getEvent(data.user.id, id);
      if (!event) {
        reply.code(404).send({ error: 'not_found' });
        return reply as never;
      }
      return { event };
    },
  );

  app.post('/events', async (request, reply) => {
    const data = request.initData;
    if (!data) {
      reply.code(401).send({ error: 'unauthorized' });
      return reply;
    }
    if (!isOrganizer(data.user.id)) {
      reply.code(403).send({ error: 'forbidden', message: 'Только организатор может создавать события' });
      return reply;
    }
    const parsed = EventInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'bad_request', message: parsed.error.message });
      return reply;
    }
    const event = createEvent(data.user.id, parsed.data);
    reply.code(201);
    return { event };
  });

  app.patch<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const data = request.initData;
    if (!data) {
      reply.code(401).send({ error: 'unauthorized' });
      return reply;
    }
    if (!isOrganizer(data.user.id)) {
      reply.code(403).send({ error: 'forbidden' });
      return reply;
    }
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      reply.code(400).send({ error: 'bad_id' });
      return reply;
    }
    const parsed = EventInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'bad_request', message: parsed.error.message });
      return reply;
    }
    const event = updateEvent(data.user.id, id, parsed.data);
    if (!event) {
      reply.code(404).send({ error: 'not_found' });
      return reply;
    }
    return { event };
  });

  app.delete<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const data = request.initData;
    if (!data) {
      reply.code(401).send({ error: 'unauthorized' });
      return reply;
    }
    if (!isOrganizer(data.user.id)) {
      reply.code(403).send({ error: 'forbidden' });
      return reply;
    }
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      reply.code(400).send({ error: 'bad_id' });
      return reply;
    }
    const ok = deleteEvent(id);
    if (!ok) {
      reply.code(404).send({ error: 'not_found' });
      return reply;
    }
    reply.code(204);
    return null;
  });

  app.post<{ Params: { id: string } }>('/events/:id/register', async (request, reply) => {
    const data = request.initData;
    if (!data) {
      reply.code(401).send({ error: 'unauthorized' });
      return reply;
    }
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      reply.code(400).send({ error: 'bad_id' });
      return reply;
    }
    const parsed = RegisterRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: 'bad_request', message: parsed.error.message });
      return reply;
    }
    const result = registerForEvent(data.user, id, parsed.data.seats);
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : result.reason === 'bad_seats' ? 400 : 409;
      reply.code(status).send({
        error: result.reason ?? 'failed',
        message:
          result.reason === 'already'
            ? 'Вы уже записаны на это событие'
            : result.reason === 'full'
              ? 'Не хватает свободных мест'
              : result.reason === 'bad_seats'
                ? 'Некорректное количество мест'
                : 'Событие не найдено',
        ...(result.event ? { event: result.event } : {}),
      });
      return reply;
    }
    if (result.event && result.registration) {
      void notifier.onRegister(result.event, data.user, result.registration);
      void sheets.recordRegister(result.event, data.user, result.registration);
    }
    return { event: result.event, registration: result.registration };
  });

  app.delete<{ Params: { id: string } }>('/events/:id/register', async (request, reply) => {
    const data = request.initData;
    if (!data) {
      reply.code(401).send({ error: 'unauthorized' });
      return reply;
    }
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      reply.code(400).send({ error: 'bad_id' });
      return reply;
    }
    const result = unregisterFromEvent(data.user.id, id);
    if (!result.ok) {
      reply.code(404).send({ error: 'not_registered' });
      return reply;
    }
    if (result.event) {
      void notifier.onUnregister(result.event, data.user);
      void sheets.recordUnregister(result.event, data.user);
    }
    return { event: result.event };
  });

  app.get<{ Params: { id: string } }>(
    '/events/:id/registrations',
    async (request, reply): Promise<RegistrationListResponse> => {
      const data = request.initData;
      if (!data) {
        reply.code(401).send({ error: 'unauthorized' });
        return reply as never;
      }
      if (!isOrganizer(data.user.id)) {
        reply.code(403).send({ error: 'forbidden' });
        return reply as never;
      }
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        reply.code(400).send({ error: 'bad_id' });
        return reply as never;
      }
      return { registrations: listRegistrations(id) };
    },
  );

  getDb();

  return app;
}

async function main() {
  const app = await buildServer();
  try {
    const host = process.env.API_HOST ?? '127.0.0.1';
    await app.listen({ port: API_PORT, host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
