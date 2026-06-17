import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import type { Event, Registration, TelegramUser } from '@app/shared';

let db: DatabaseType | null = null;

function resolveDbPath(): string {
  const raw = process.env.DATABASE_PATH ?? './data/app.sqlite';
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

function migrate(database: DatabaseType): void {
  const cols = database
    .prepare<[], { name: string }>('PRAGMA table_info(registrations)')
    .all()
    .map((r) => r.name);
  if (!cols.includes('seats')) {
    database.exec('ALTER TABLE registrations ADD COLUMN seats INTEGER NOT NULL DEFAULT 1');
  }
  if (!cols.includes('booking_number')) {
    database.exec('ALTER TABLE registrations ADD COLUMN booking_number INTEGER NOT NULL DEFAULT 0');
    const events = database
      .prepare<[], { id: number }>('SELECT id FROM events')
      .all();
    const select = database.prepare<[number], { id: number }>(
      'SELECT id FROM registrations WHERE event_id = ? ORDER BY created_at ASC, id ASC',
    );
    const update = database.prepare(
      'UPDATE registrations SET booking_number = ? WHERE id = ?',
    );
    const trx = database.transaction((rows: { id: number }[], evId: number) => {
      let n = 0;
      for (const row of rows) {
        n += 1;
        update.run(n, row.id);
      }
      void evId;
    });
    for (const ev of events) {
      const rows = select.all(ev.id);
      trx(rows, ev.id);
    }
  }
}

export function getDb(): DatabaseType {
  if (db) return db;

  const path = resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      location     TEXT NOT NULL DEFAULT '',
      starts_at    INTEGER NOT NULL,
      capacity     INTEGER NOT NULL DEFAULT 0,
      organizer_id INTEGER NOT NULL,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at);

    CREATE TABLE IF NOT EXISTS registrations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id        INTEGER NOT NULL,
      booking_number INTEGER NOT NULL DEFAULT 0,
      seats          INTEGER NOT NULL DEFAULT 1,
      first_name     TEXT NOT NULL,
      last_name      TEXT,
      username       TEXT,
      language_code  TEXT,
      photo_url      TEXT,
      created_at     INTEGER NOT NULL,
      UNIQUE(event_id, user_id),
      UNIQUE(event_id, booking_number)
    );
    CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);
    CREATE INDEX IF NOT EXISTS idx_registrations_user  ON registrations(user_id);
  `);
  migrate(db);
  return db;
}

interface EventRow {
  id: number;
  title: string;
  description: string;
  location: string;
  starts_at: number;
  capacity: number;
  organizer_id: number;
  created_at: number;
  updated_at: number;
  registered_count: number;
  booked_seats: number;
  is_registered: number;
  my_booking_number: number | null;
  my_seats: number;
}

interface RegistrationRow {
  id: number;
  event_id: number;
  user_id: number;
  booking_number: number;
  seats: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  language_code: string | null;
  photo_url: string | null;
  created_at: number;
}

const EVENT_SELECT = `
  SELECT
    e.id, e.title, e.description, e.location, e.starts_at, e.capacity,
    e.organizer_id, e.created_at, e.updated_at,
    (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) AS registered_count,
    COALESCE((SELECT SUM(seats) FROM registrations r WHERE r.event_id = e.id), 0) AS booked_seats,
    EXISTS(SELECT 1 FROM registrations r WHERE r.event_id = e.id AND r.user_id = ?) AS is_registered,
    (SELECT booking_number FROM registrations r WHERE r.event_id = e.id AND r.user_id = ?) AS my_booking_number,
    COALESCE((SELECT seats FROM registrations r WHERE r.event_id = e.id AND r.user_id = ?), 0) AS my_seats
  FROM events e
`;

function rowToEvent(row: EventRow): Event {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.starts_at,
    capacity: row.capacity,
    organizerId: row.organizer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    registeredCount: row.registered_count,
    bookedSeats: row.booked_seats,
    isRegistered: row.is_registered === 1,
    myBookingNumber: row.my_booking_number ?? null,
    mySeats: row.my_seats,
  };
}

function rowToRegistration(row: RegistrationRow): Registration {
  const user: TelegramUser = {
    id: row.user_id,
    first_name: row.first_name,
    ...(row.last_name ? { last_name: row.last_name } : {}),
    ...(row.username ? { username: row.username } : {}),
    ...(row.language_code ? { language_code: row.language_code } : {}),
    ...(row.photo_url ? { photo_url: row.photo_url } : {}),
  };
  return {
    id: row.id,
    eventId: row.event_id,
    bookingNumber: row.booking_number,
    seats: row.seats,
    user,
    createdAt: row.created_at,
  };
}

export function listEvents(viewerId: number, options: { upcomingOnly?: boolean } = {}): Event[] {
  const upcomingOnly = options.upcomingOnly ?? true;
  if (upcomingOnly) {
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    const rows = getDb()
      .prepare<[number, number, number, number], EventRow>(
        `${EVENT_SELECT} WHERE e.starts_at >= ? ORDER BY e.starts_at ASC`,
      )
      .all(viewerId, viewerId, viewerId, cutoff);
    return rows.map(rowToEvent);
  }
  const rows = getDb()
    .prepare<[number, number, number], EventRow>(
      `${EVENT_SELECT} ORDER BY e.starts_at DESC`,
    )
    .all(viewerId, viewerId, viewerId);
  return rows.map(rowToEvent);
}

export function getEvent(viewerId: number, id: number): Event | null {
  const row = getDb()
    .prepare<[number, number, number, number], EventRow>(`${EVENT_SELECT} WHERE e.id = ?`)
    .get(viewerId, viewerId, viewerId, id);
  return row ? rowToEvent(row) : null;
}

export interface EventInputData {
  title: string;
  description: string;
  location: string;
  startsAt: number;
  capacity: number;
}

export function createEvent(organizerId: number, data: EventInputData): Event {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `INSERT INTO events (title, description, location, starts_at, capacity, organizer_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.title,
      data.description,
      data.location,
      data.startsAt,
      data.capacity,
      organizerId,
      now,
      now,
    );
  const id = Number(result.lastInsertRowid);
  return getEvent(organizerId, id)!;
}

export function updateEvent(viewerId: number, id: number, data: EventInputData): Event | null {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `UPDATE events
       SET title = ?, description = ?, location = ?, starts_at = ?, capacity = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(data.title, data.description, data.location, data.startsAt, data.capacity, now, id);
  if (result.changes === 0) return null;
  return getEvent(viewerId, id);
}

export function deleteEvent(id: number): boolean {
  const result = getDb().prepare('DELETE FROM events WHERE id = ?').run(id);
  return result.changes > 0;
}

export interface RegisterResult {
  ok: boolean;
  reason?: 'already' | 'full' | 'not_found' | 'bad_seats';
  event?: Event;
  registration?: Registration;
}

export function registerForEvent(
  user: TelegramUser,
  eventId: number,
  seats: number,
): RegisterResult {
  if (!Number.isInteger(seats) || seats < 1) {
    return { ok: false, reason: 'bad_seats' };
  }
  const database = getDb();
  const trx = database.transaction((): RegisterResult => {
    const event = database
      .prepare<[number, number, number, number], EventRow>(`${EVENT_SELECT} WHERE e.id = ?`)
      .get(user.id, user.id, user.id, eventId);
    if (!event) return { ok: false, reason: 'not_found' };
    if (event.is_registered === 1) {
      return { ok: false, reason: 'already', event: rowToEvent(event) };
    }
    if (event.capacity > 0 && event.booked_seats + seats > event.capacity) {
      return { ok: false, reason: 'full', event: rowToEvent(event) };
    }
    const nextNumberRow = database
      .prepare<[number], { next: number }>(
        'SELECT COALESCE(MAX(booking_number), 0) + 1 AS next FROM registrations WHERE event_id = ?',
      )
      .get(eventId);
    const bookingNumber = nextNumberRow?.next ?? 1;
    const now = Date.now();
    const insert = database
      .prepare(
        `INSERT INTO registrations
           (event_id, user_id, booking_number, seats, first_name, last_name, username, language_code, photo_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        eventId,
        user.id,
        bookingNumber,
        seats,
        user.first_name,
        user.last_name ?? null,
        user.username ?? null,
        user.language_code ?? null,
        user.photo_url ?? null,
        now,
      );
    const registrationId = Number(insert.lastInsertRowid);
    const registration: Registration = {
      id: registrationId,
      eventId,
      bookingNumber,
      seats,
      user,
      createdAt: now,
    };
    const updated = getEvent(user.id, eventId);
    return { ok: true, ...(updated ? { event: updated } : {}), registration };
  });
  return trx();
}

export function unregisterFromEvent(
  userId: number,
  eventId: number,
): { ok: boolean; event?: Event } {
  const result = getDb()
    .prepare('DELETE FROM registrations WHERE event_id = ? AND user_id = ?')
    .run(eventId, userId);
  if (result.changes === 0) return { ok: false };
  const updated = getEvent(userId, eventId);
  return { ok: true, ...(updated ? { event: updated } : {}) };
}

export function listRegistrations(eventId: number): Registration[] {
  const rows = getDb()
    .prepare<[number], RegistrationRow>(
      `SELECT id, event_id, user_id, booking_number, seats, first_name, last_name, username, language_code, photo_url, created_at
       FROM registrations
       WHERE event_id = ?
       ORDER BY booking_number ASC`,
    )
    .all(eventId);
  return rows.map(rowToRegistration);
}
