import { Routes, Route, Link } from 'react-router-dom';
import { Placeholder, Button } from '@telegram-apps/telegram-ui';
import { HomePage } from './pages/HomePage';
import { EventPage } from './pages/EventPage';
import { EventFormPage } from './pages/EventFormPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';

function NotFoundPage() {
  return (
    <Placeholder
      header="404"
      description="Страница не найдена"
      action={
        <Link to="/">
          <Button>На главную</Button>
        </Link>
      }
    />
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/events/new" element={<EventFormPage mode="create" />} />
      <Route path="/events/:id" element={<EventPage />} />
      <Route path="/events/:id/edit" element={<EventFormPage mode="edit" />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
