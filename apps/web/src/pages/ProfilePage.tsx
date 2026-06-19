import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Section, Cell, Title, Spinner } from '@telegram-apps/telegram-ui';
import { getTelegram, getTelegramUser } from '../lib/telegram';
import { useMe } from '../lib/MeContext';

export function ProfilePage() {
  const navigate = useNavigate();
  const { me, loading, error } = useMe();

  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;
    const handleBack = () => navigate('/');
    tg.BackButton.show();
    tg.BackButton.onClick(handleBack);
    tg.MainButton.hide();
    return () => {
      tg.BackButton.offClick(handleBack);
      tg.BackButton.hide();
    };
  }, [navigate]);

  const tgUser = getTelegramUser();

  return (
    <div className="page">
      <Title weight="2">Профиль</Title>

      <Section header="Данные из Telegram WebApp">
        {tgUser ? (
          <>
            <Cell subtitle={String(tgUser.id)}>ID</Cell>
            <Cell subtitle={`${tgUser.first_name}${tgUser.last_name ? ' ' + tgUser.last_name : ''}`}>
              Имя
            </Cell>
            {tgUser.username ? <Cell subtitle={`@${tgUser.username}`}>Username</Cell> : null}
            {tgUser.language_code ? <Cell subtitle={tgUser.language_code}>Язык</Cell> : null}
          </>
        ) : (
          <Cell>Mini App запущен вне Telegram</Cell>
        )}
      </Section>

      <Section header="Статус">
        {loading ? (
          <div style={{ padding: 12, display: 'flex', justifyContent: 'center' }}>
            <Spinner size="s" />
          </div>
        ) : error ? (
          <Cell subtitle={error}>Ошибка</Cell>
        ) : me ? (
          <>
            <Cell subtitle={me.isOrganizer ? 'Организатор' : 'Участник'}>Роль</Cell>
            <Cell subtitle={new Date(me.authDate * 1000).toLocaleString('ru-RU')}>
              initData выписан
            </Cell>
          </>
        ) : null}
      </Section>
    </div>
  );
}
