import { createRoot } from 'react-dom/client';
import App from './App';

// Note: StrictMode is disabled because SuperDoc's toolbar Vue component
// doesn't properly handle the double-mount/unmount cycle that Strict Mode causes.
// This is a known limitation when integrating Vue components in React.
createRoot(document.getElementById('root')).render(<App />);
