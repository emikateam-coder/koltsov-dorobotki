import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Section, Title, Input, Textarea, Button, Spinner, Placeholder } from '@telegram-apps/telegram-ui';
import type { EventInput } from '@app/shared';
import { getTelegram, hapticImpact } from '../lib/telegram';
import { ApiError, createEvent, getEventById, updateEvent } from '../api/client';
import { useMe } from '../lib/MeContext';
import { fromDateTimeLocalInput, toDateTimeLocalInput } from '../lib/format';

interface Props {
  mode: 'create' | 'edit';
}

const ONE_HOUR = 60 * 60 * 1000;

export function EventFormPage({ mode }: Props) {
  const navigate = useNavigate();
  const { id: idParam } = useParams<{ id: string }>();
  const { me, loading: meLoading } = useMe();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState<string>(toDateTimeLocalInput(Date.now() + ONE_HOUR));
  const [capacity, setCapacity] = useState<string>('0');
  const [loading, setLoading] = useState(mode === 'edit');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = mode === 'edit' ? Number(idParam) : 0;

  useEffect(() => {
    if (mode !== 'edit') return;
    if (!Number.isInteger(id) || id <= 0) {
      setError('Неверный идентификатор события');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getEventById(id)
      .then((ev) => {
        if (cancelled) return;
        setTitle(ev.title);
        setDescription(ev.description);
        setLocation(ev.location);
        setStartsAt(toDateTimeLocalInput(ev.startsAt));
        setCapacity(String(ev.capacity));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, id]);

  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;
    const handleBack = () => navigate(mode === 'edit' && id ? `/events/${id}` : '/');
    tg.BackButton.show();
    tg.BackButton.onClick(handleBack);
    tg.MainButton.hide();
    return () => {
      tg.BackButton.offClick(handleBack);
      tg.BackButton.hide();
    };
  }, [navigate, mode, id]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Введите название события');
      return;
    }
    const startsAtTs = fromDateTimeLocalInput(startsAt);
    if (!Number.isFinite(startsAtTs)) {
      setError('Введите корректную дату и время');
      return;
    }
    const capacityNum = Number.parseInt(capacity, 10);
    if (!Number.isInteger(capacityNum) || capacityNum < 0) {
      setError('Вместимость должна быть числом >= 0 (0 = без ограничения)');
      return;
    }

    const payload: EventInput = {
      title: trimmedTitle,
      description: description.trim(),
      location: location.trim(),
      startsAt: startsAtTs,
      capacity: capacityNum,
    };

    setSubmitting(true);
    try {
      const event = mode === 'create' ? await createEvent(payload) : await updateEvent(id, payload);
      hapticImpact('medium');
      navigate(`/events/${event.id}`);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSubmitting(false);
    }
  }, [title, description, location, startsAt, capacity, mode, id, navigate]);

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
          description="Создавать и редактировать события могут только организаторы."
          action={<Button onClick={() => navigate('/')}>На главную</Button>}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
          <Spinner size="m" />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Title weight="2">{mode === 'create' ? 'Новое событие' : 'Редактирование'}</Title>

      <Section header="Основное">
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            header="Название"
            placeholder="Например, Йога в парке"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            disabled={submitting}
          />
          <Textarea
            header="Описание"
            placeholder="Расскажите подробнее"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            disabled={submitting}
            rows={4}
          />
          <Input
            header="Место"
            placeholder="Адрес или название точки"
            value={location}
            onChange={(e) => setLocation(e.currentTarget.value)}
            disabled={submitting}
          />
          <Input
            header="Дата и время"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.currentTarget.value)}
            disabled={submitting}
          />
          <Input
            header="Вместимость (0 — без ограничения)"
            type="number"
            inputMode="numeric"
            value={capacity}
            onChange={(e) => setCapacity(e.currentTarget.value)}
            disabled={submitting}
          />
        </div>
      </Section>

      {error ? (
        <Section header="Ошибка">
          <div style={{ padding: 12 }}>{error}</div>
        </Section>
      ) : null}

      <div style={{ paddingTop: 4 }}>
        <Button stretched disabled={submitting} onClick={handleSubmit}>
          {submitting ? 'Сохраняю…' : mode === 'create' ? 'Создать' : 'Сохранить'}
        </Button>
      </div>
    </div>
  );
}

function formatError(err: unknown): string {
  if (err instanceof ApiError) return `${err.status}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return 'Неизвестная ошибка';
}
