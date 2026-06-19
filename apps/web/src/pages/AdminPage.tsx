import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Section,
  Cell,
  Title,
  Text,
  Spinner,
  Button,
  Placeholder,
  Tabbar,
} from '@telegram-apps/telegram-ui';
import type { Event } from '@app/shared';
import { getTelegram, hapticImpact } from '../lib/telegram';
import { ApiError, listEvents } from '../api/client';
import { useMe } from '../lib/MeContext';
import { formatEventDate } from '../lib/format';

type Tab = 'upcoming' | 'past';

export function AdminPage() {
  const navigate = useNavigate();
  const { me, loading: meLoading } = useMe();

  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listEvents(true);
      setAllEvents(data.events);
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
    const handleBack = () => navigate('/');
    tg.BackButton.show();
    tg.BackButton.onClick(handleBack);

    const handleMain = () => {
      hapticImpact('medium');
      navigate('/events/new');
    };
    tg.MainButton.setText('Создать событие');
    tg.MainButton.show();
    tg.MainButton.enable();
    tg.MainButton.onClick(handleMain);

    return () => {
      tg.BackButton.offClick(handleBack);
      tg.BackButton.hide();
      tg.MainButton.offClick(handleMain);
      tg.MainButton.hide();
    };
  }, [navigate]);

  const stats = useMemo(() => {
    const now = Date.now();
    const upcoming = allEvents.filter((e) => e.startsAt >= now - 6 * 60 * 60 * 1000);
    const past = allEvents.filter((e) => e.startsAt < now - 6 * 60 * 60 * 1000);
    const totalBookings = allEvents.reduce((sum, e) => sum + e.registeredCount, 0);
    const totalSeats = allEvents.reduce((sum, e) => sum + e.bookedSeats, 0);
    return { upcoming, past, totalBookings, totalSeats, totalEvents: allEvents.length };
  }, [allEvents]);

  const visibleEvents = tab === 'upcoming' ? stats.upcoming : stats.past;

  if (meLoading) {
    return (
      <div className="page">
        <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
          <Spinner size="m" />
        </div>
      </div>
    );
  }

  if (!me?.isOrganizer) {
    return (
      <div className="page">
        <Placeholder
          header="Доступ запрещён"
          description="Эта страница доступна только организаторам."
          action={<Button onClick={() => navigate('/')}>На главную</Button>}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <Title weight="2">Админка</Title>
      <Text>Управление всеми событиями. Уведомления о записях приходят в этот чат с ботом.</Text>

      <Section header="Статистика">
        <Cell subtitle={String(stats.totalEvents)}>Всего событий</Cell>
        <Cell subtitle={String(stats.upcoming.length)}>Предстоящих</Cell>
        <Cell subtitle={String(stats.past.length)}>Прошедших</Cell>
        <Cell subtitle={String(stats.totalBookings)}>Всего броней</Cell>
        <Cell subtitle={String(stats.totalSeats)}>Всего занятых мест</Cell>
      </Section>

      <Tabbar>
        <Tabbar.Item
          selected={tab === 'upcoming'}
          onClick={() => setTab('upcoming')}
          text={`Предстоящие (${stats.upcoming.length})`}
        >
          {null}
        </Tabbar.Item>
        <Tabbar.Item
          selected={tab === 'past'}
          onClick={() => setTab('past')}
          text={`Прошедшие (${stats.past.length})`}
        >
          {null}
        </Tabbar.Item>
      </Tabbar>

      {error ? (
        <Section header="Ошибка">
          <Cell subtitle={error}>Что-то пошло не так</Cell>
        </Section>
      ) : null}

      <Section header={tab === 'upcoming' ? 'Предстоящие события' : 'Прошедшие события'}>
        {loading ? (
          <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
            <Spinner size="m" />
          </div>
        ) : visibleEvents.length === 0 ? (
          <Placeholder
            description={tab === 'upcoming' ? 'Предстоящих событий нет' : 'Прошедших событий нет'}
          />
        ) : (
          visibleEvents.map((event) => (
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
                </span>
              }
            >
              {event.title}
            </Cell>
          ))
        )}
      </Section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
        <Button stretched onClick={() => navigate('/events/new')}>
          Создать событие
        </Button>
        <Button stretched mode="outline" onClick={() => void reload()} disabled={loading}>
          Обновить
        </Button>
      </div>
    </div>
  );
}

function capacityLabel(event: Event): string {
  if (event.capacity === 0) return `${event.bookedSeats} мест занято · ${event.registeredCount} броней`;
  return `${event.bookedSeats}/${event.capacity} · ${event.registeredCount} броней`;
}
