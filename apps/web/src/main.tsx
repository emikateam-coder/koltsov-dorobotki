import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRoot } from '@telegram-apps/telegram-ui';
import '@telegram-apps/telegram-ui/dist/styles.css';
import { App } from './App';
import { initTelegram } from './lib/telegram';
import { MeProvider } from './lib/MeContext';
import './styles.css';

initTelegram();

const tg = window.Telegram?.WebApp;
const colorScheme: 'light' | 'dark' = tg?.colorScheme ?? 'light';
const platform = tg?.platform === 'ios' ? 'ios' : 'base';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <React.StrictMode>
    <AppRoot appearance={colorScheme} platform={platform}>
      <BrowserRouter>
        <MeProvider>
          <App />
        </MeProvider>
      </BrowserRouter>
    </AppRoot>
  </React.StrictMode>,
);
