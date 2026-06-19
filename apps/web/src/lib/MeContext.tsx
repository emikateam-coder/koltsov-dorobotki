import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MeResponse } from '@app/shared';
import { ApiError, getMe } from '../api/client';

interface MeContextValue {
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const MeContext = createContext<MeContextValue | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMe();
        setMe(data);
      } catch (err) {
        if (err instanceof ApiError) setError(`${err.status}: ${err.message}`);
        else if (err instanceof Error) setError(err.message);
        else setError('Не удалось получить данные пользователя');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({ me, loading, error, reload }), [me, loading, error, reload]);

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe(): MeContextValue {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error('useMe must be used within MeProvider');
  return ctx;
}
