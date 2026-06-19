import { loadEnv } from './loadEnv.js';
loadEnv();

import { Bot, InlineKeyboard, GrammyError, HttpError } from 'grammy';

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL;
const ORGANIZER_IDS = new Set<number>(
  (process.env.ORGANIZER_TELEGRAM_IDS ?? '')
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0),
);

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is required');
  process.exit(1);
}
if (!WEB_APP_URL) {
  console.error('WEB_APP_URL is required');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

bot.command('start', async (ctx) => {
  const keyboard = new InlineKeyboard().webApp('Открыть Mini App', WEB_APP_URL);
  const userId = ctx.from?.id;
  const isOrganizer = userId !== undefined && ORGANIZER_IDS.has(userId);

  const text = isOrganizer
    ? 'Привет, организатор!\n\nЗдесь ты управляешь событиями и видишь записавшихся. Уведомления о новых записях и отменах будут приходить сюда.'
    : 'Привет! Жми кнопку, чтобы открыть Mini App и записаться на событие.';

  await ctx.reply(text, { reply_markup: keyboard });
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    [
      'Доступные команды:',
      '/start — открыть Mini App',
      '/help — показать это сообщение',
    ].join('\n'),
  );
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Error in request:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Could not contact Telegram:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

async function main() {
  console.log('Starting bot in long polling mode…');
  await bot.start({
    onStart: (info) => {
      console.log(`Bot @${info.username} started`);
    },
  });
}

void main();
