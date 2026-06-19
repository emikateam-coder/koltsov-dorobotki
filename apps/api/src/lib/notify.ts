import type { Event, Registration, TelegramUser } from '@app/shared';

interface SendOptions {
  chatId: number;
  text: string;
  disableNotification?: boolean;
}

async function sendMessage(token: string, opts: SendOptions): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: opts.chatId,
      text: opts.text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(opts.disableNotification ? { disable_notification: true } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram sendMessage failed (${res.status}): ${body}`);
  }
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function userLabel(user: TelegramUser): string {
  const name = `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`.trim();
  const handle = user.username ? `@${user.username}` : `id ${user.id}`;
  return `${escape(name)} (${escape(handle)})`;
}

function eventLine(event: Event): string {
  const date = new Date(event.startsAt).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const capacity =
    event.capacity === 0
      ? `${event.bookedSeats} мест занято (без ограничения)`
      : `${event.bookedSeats}/${event.capacity}`;
  return `<b>${escape(event.title)}</b>\n${escape(date)}${event.location ? ' · ' + escape(event.location) : ''}\nМеста: ${capacity}\nБроней: ${event.registeredCount}`;
}

export interface NotifyDeps {
  botToken: string;
  organizerIds: ReadonlySet<number>;
  logger?: { warn: (obj: unknown, msg?: string) => void };
}

export function createNotifier(deps: NotifyDeps) {
  const { botToken, organizerIds, logger } = deps;

  async function notifyAllOrganizers(text: string): Promise<void> {
    if (!botToken || organizerIds.size === 0) return;
    await Promise.all(
      Array.from(organizerIds).map((chatId) =>
        sendMessage(botToken, { chatId, text }).catch((err) => {
          logger?.warn({ err, chatId }, 'failed to notify organizer');
        }),
      ),
    );
  }

  return {
    async onRegister(event: Event, user: TelegramUser, registration: Registration): Promise<void> {
      const text =
        `🆕 Новая запись\n\n${eventLine(event)}\n\n` +
        `Бронь №${registration.bookingNumber}\n` +
        `Мест: ${registration.seats}\n` +
        `Записал(а): ${userLabel(user)}`;
      await notifyAllOrganizers(text);
    },
    async onUnregister(event: Event, user: TelegramUser): Promise<void> {
      const text = `❌ Отмена записи\n\n${eventLine(event)}\n\nОтменил(а): ${userLabel(user)}`;
      await notifyAllOrganizers(text);
    },
  };
}

export type Notifier = ReturnType<typeof createNotifier>;
