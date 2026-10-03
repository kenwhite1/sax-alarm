import { initLang } from './lib/i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme.css';

initLang();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
