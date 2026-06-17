import { createHmac, timingSafeEqual } from 'node:crypto';
import { TelegramUserSchema, type TelegramUser } from '@app/shared';

export interface ValidatedInitData {
  user: TelegramUser;
  authDate: number;
  raw: string;
}

export class InitDataError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'InitDataError';
  }
}

const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24;

export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS,
): ValidatedInitData {
  if (!initData) {
    throw new InitDataError('missing_init_data', 'initData is empty');
  }
  if (!botToken) {
    throw new InitDataError('missing_bot_token', 'BOT_TOKEN is not configured');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    throw new InitDataError('missing_hash', 'hash is missing in initData');
  }
  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .map(([key, value]) => [key, value] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const computedBuf = Buffer.from(computed, 'hex');
  const providedBuf = Buffer.from(hash, 'hex');
  if (computedBuf.length !== providedBuf.length || !timingSafeEqual(computedBuf, providedBuf)) {
    throw new InitDataError('bad_hash', 'initData hash mismatch');
  }

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw) {
    throw new InitDataError('missing_auth_date', 'auth_date is missing');
  }
  const authDate = Number.parseInt(authDateRaw, 10);
  if (!Number.isFinite(authDate)) {
    throw new InitDataError('bad_auth_date', 'auth_date is not a valid integer');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > maxAgeSeconds) {
    throw new InitDataError('expired', 'initData is too old');
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    throw new InitDataError('missing_user', 'user field is missing in initData');
  }

  let userJson: unknown;
  try {
    userJson = JSON.parse(userRaw);
  } catch {
    throw new InitDataError('bad_user_json', 'user field is not valid JSON');
  }

  const parsed = TelegramUserSchema.safeParse(userJson);
  if (!parsed.success) {
    throw new InitDataError('bad_user_shape', 'user field does not match expected schema');
  }

  return {
    user: parsed.data,
    authDate,
    raw: initData,
  };
}
