import React from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import App from './App';
import Settings from './pages/Settings';
import { ChatProvider } from './context/ChatContext';

const router = createHashRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/settings',
    element: <Settings />,
  },
]);

// Find the root element
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ChatProvider>
      <RouterProvider router={router} />
    </ChatProvider>
  </React.StrictMode>
); 