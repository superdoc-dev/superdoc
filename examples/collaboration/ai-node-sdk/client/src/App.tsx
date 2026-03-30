import { Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/landing';
import { RoomPage } from './pages/room';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
    </Routes>
  );
}
