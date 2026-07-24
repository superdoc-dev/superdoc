import { createRoot } from 'react-dom/client';
import { SuperDocUIProvider } from 'superdoc/ui/react';
import 'superdoc/style.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <SuperDocUIProvider>
    <App />
  </SuperDocUIProvider>,
);
