import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = document.querySelector('#root');
if (!root) throw new Error('The React root is missing.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
