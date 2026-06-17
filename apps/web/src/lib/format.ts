const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatEventDate(timestampMs: number): string {
  return DATE_FMT.format(new Date(timestampMs));
}

export function toDateTimeLocalInput(timestampMs: number): string {
  const d = new Date(timestampMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocalInput(value: string): number {
  return new Date(value).getTime();
}
