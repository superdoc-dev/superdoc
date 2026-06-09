import { createRoot } from 'react-dom/client';
import App from './App';
import 'superdoc/style.css';
import './App.css';

// Note: StrictMode removed to prevent double-mounting which causes SuperDoc to reload
createRoot(document.getElementById('root')!).render(<App />);
