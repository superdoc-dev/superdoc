import { createRoot } from 'react-dom/client';
import React from 'react';
import './style.css';
import App from './App.jsx';

const root = document.getElementById('app');
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
