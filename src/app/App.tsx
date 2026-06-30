import { GamePage } from '../pages/GamePage';
import { RoomEditorPage } from '../pages/RoomEditorPage';

export function App() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const appPath = basePath && window.location.pathname.startsWith(basePath)
    ? window.location.pathname.slice(basePath.length) || '/'
    : window.location.pathname;

  if (appPath === '/editor') {
    return <RoomEditorPage />;
  }

  return <GamePage />;
}
