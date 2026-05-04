import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { JsonModalProvider } from './components/shared/json-modal-manager';
import './index.css';
import '@superdoc-dev/react/style.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <JsonModalProvider>
          <App />
        </JsonModalProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
