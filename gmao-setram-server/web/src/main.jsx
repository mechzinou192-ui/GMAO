import React from 'react';
import { createRoot } from 'react-dom/client';
// Police de la charte SETRAM : Montserrat, embarquée (aucun appel externe — compatible avec la CSP du serveur)
import '@fontsource/montserrat/latin-400.css';
import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/latin-700.css';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
