import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Section, Cell, Title, Text, Spinner, Placeholder, Button } from '@telegram-apps/telegram-ui';
import type { Event } from '@app/shared';
import { getTelegram, hapticImpact } from '../lib/telegram';
import { ApiError, listEvents } from '../api/client';
import { useMe } from '../lib/MeContext';
import { formatEventDate } from '../lib/format';

export function HomePage() {
  const navigate = useNavigate();
  const { me, loading: meLoading } = useMe();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listEvents();
      setEvents(data.events);
    } catch (err) {
      if (err instanceof ApiError) setError(`${err.status}: ${err.message}`);
      else if (err instanceof Error) setError(err.message);
      else setError('Не удалось загрузить события');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;

    tg.BackButton.hide();

    if (!me?.isOrganizer) {
      tg.MainButton.hide();
      return;
    }

    const handleClick = () => {
      hapticImpact('medium');
      navigate('/events/new');
    };

    tg.MainButton.setText('Создать событие');
    tg.MainButton.show();
    tg.MainButton.enable();
    tg.MainButton.onClick(handleClick);

    return () => {
      tg.MainButton.offClick(handleClick);
      tg.MainButton.hide();
    };
  }, [navigate, me?.isOrganizer]);

  return (
    <div className="page">
      <Title weight="2">События</Title>
      <Text>
        {me?.isOrganizer
          ? 'Вы организатор. Создавайте события и смотрите список записавшихся.'
          : 'Выберите событие и запишитесь.'}
      </Text>

      {error ? (
        <Section header="Ошибка">
          <Cell subtitle={error}>Что-то пошло не так</Cell>
        </Section>
      ) : null}

      <Section header={`Ближайшие события (${events.length})`}>
        {loading || meLoading ? (
          <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
            <Spinner size="m" />
          </div>
        ) : events.length === 0 ? (
          <Placeholder
            description={
              me?.isOrganizer
                ? 'Событий пока нет. Нажмите «Создать событие» внизу.'
                : 'Событий пока нет. Загляните позже.'
            }
          />
        ) : (
          events.map((event) => (
            <Cell
              key={event.id}
              onClick={() => {
                hapticImpact('light');
                navigate(`/events/${event.id}`);
              }}
              subtitle={
                <span>
                  {formatEventDate(event.startsAt)}
                  {event.location ? ` · ${event.location}` : ''}
                  {' · '}
                  {capacityLabel(event)}
                  {event.isRegistered ? ` · ваша бронь №${event.myBookingNumber ?? '—'}` : ''}
                </span>
              }
            >
              {event.title}
            </Cell>
          ))
        )}
      </Section>

      {!me?.isOrganizer ? null : (
        <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button stretched onClick={() => navigate('/events/new')}>
            Создать событие
          </Button>
          <Button stretched mode="outline" onClick={() => navigate('/admin')}>
            Админка
          </Button>
        </div>
      )}
    </div>
  );
}

function capacityLabel(event: Event): string {
  if (event.capacity === 0) return `${event.bookedSeats} мест занято`;
  return `${event.bookedSeats}/${event.capacity}`;
}
