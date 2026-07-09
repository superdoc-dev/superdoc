import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Note: StrictMode disabled because SuperDoc uses DOM-based initialization
// that doesn't handle double-render well
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
