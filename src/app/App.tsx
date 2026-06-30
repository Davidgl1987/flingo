import { GamePage } from '../pages/GamePage';
import { RoomEditorPage } from '../pages/RoomEditorPage';

export function App() {
  if (window.location.pathname === '/editor') {
    return <RoomEditorPage />;
  }

  return <GamePage />;
}
