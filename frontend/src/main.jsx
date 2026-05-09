import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
  >
    <App />
  </BrowserRouter>,
);

// Splash fade-out is owned by App.jsx — it knows when auth has
// finished bootstrapping, so the splash stays up through the auth
// hydration step instead of flashing the spinner-on-pink fallback.
