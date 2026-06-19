import { readFileSync } from 'node:fs';
import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import type { Event, Registration, TelegramUser } from '@app/shared';

const HEADER_ROW: ReadonlyArray<string> = [
  'Время',
  'ID события',
  'Событие',
  'Когда',
  'Место',
  'Действие',
  'Бронь №',
  'Мест',
  'Имя',
  'Фамилия',
  'Username',
  'Telegram ID',
];

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function loadServiceAccount(): ServiceAccount | null {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const path = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  let raw: string | null = null;
  if (inline && inline.trim().length > 0) {
    raw = inline;
  } else if (path && path.trim().length > 0) {
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
      return null;
    }
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
    };
  } catch {
    return null;
  }
}

interface SheetsConfig {
  spreadsheetId: string;
  sheetName: string;
  client: sheets_v4.Sheets;
}

export interface SheetsExporter {
  enabled: boolean;
  recordRegister(event: Event, user: TelegramUser, registration: Registration): Promise<void>;
  recordUnregister(event: Event, user: TelegramUser): Promise<void>;
}

export interface SheetsDeps {
  logger: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
}

export function createSheetsExporter(deps: SheetsDeps): SheetsExporter {
  const spreadsheetId = (process.env.GOOGLE_SHEET_ID ?? '').trim();
  const sheetName = (process.env.GOOGLE_SHEET_NAME ?? 'Registrations').trim() || 'Registrations';
  const credentials = loadServiceAccount();

  if (!spreadsheetId || !credentials) {
    if (spreadsheetId && !credentials) {
      deps.logger.warn(
        {},
        'GOOGLE_SHEET_ID is set but service account credentials are missing — sheets export disabled',
      );
    }
    return {
      enabled: false,
      async recordRegister() {},
      async recordUnregister() {},
    };
  }

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = google.sheets({ version: 'v4', auth });

  const config: SheetsConfig = { spreadsheetId, sheetName, client };
  let headerEnsured = false;

  async function ensureHeader(): Promise<void> {
    if (headerEnsured) return;
    try {
      const meta = await client.spreadsheets.get({ spreadsheetId });
      const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName);
      if (!sheet) {
        await client.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: sheetName } } }],
          },
        });
      }
      const headerRange = `${sheetName}!A1:${columnLetter(HEADER_ROW.length)}1`;
      const current = await client.spreadsheets.values.get({
        spreadsheetId,
        range: headerRange,
      });
      const present = current.data.values?.[0] ?? [];
      if (present.length === 0) {
        await client.spreadsheets.values.update({
          spreadsheetId,
          range: headerRange,
          valueInputOption: 'RAW',
          requestBody: { values: [Array.from(HEADER_ROW)] },
        });
      }
      headerEnsured = true;
    } catch (err) {
      deps.logger.warn({ err }, 'failed to ensure sheets header');
    }
  }

  async function appendRow(row: ReadonlyArray<string | number>): Promise<void> {
    await ensureHeader();
    try {
      await config.client.spreadsheets.values.append({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!A:A`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [Array.from(row)] },
      });
      deps.logger.info({ row }, 'sheets row appended');
    } catch (err) {
      deps.logger.warn({ err }, 'failed to append row to Google Sheets');
    }
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  function eventDate(event: Event): string {
    return new Date(event.startsAt).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return {
    enabled: true,
    async recordRegister(event, user, registration) {
      await appendRow([
        nowIso(),
        event.id,
        event.title,
        eventDate(event),
        event.location,
        'Запись',
        registration.bookingNumber,
        registration.seats,
        user.first_name,
        user.last_name ?? '',
        user.username ? '@' + user.username : '',
        user.id,
      ]);
    },
    async recordUnregister(event, user) {
      await appendRow([
        nowIso(),
        event.id,
        event.title,
        eventDate(event),
        event.location,
        'Отмена',
        '',
        '',
        user.first_name,
        user.last_name ?? '',
        user.username ? '@' + user.username : '',
        user.id,
      ]);
    },
  };
}

function columnLetter(index: number): string {
  let result = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
