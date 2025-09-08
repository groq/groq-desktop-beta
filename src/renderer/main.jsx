import React from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import App from './App';
import Settings from './pages/Settings';
import PopupPage from './pages/PopupPage';
import { ChatProvider } from './context/ChatContext';

// Wrap components with ChatProvider where needed
const AppWithProvider = () => (
  <ChatProvider>
    <App />
  </ChatProvider>
);

const router = createHashRouter([
  {
    path: '/',
    element: <AppWithProvider />,
  },
  {
    path: '/settings',
    element: <Settings />,
  },
  {
    path: '/popup',
    element: (
      <ChatProvider>
        <PopupPage />
      </ChatProvider>
    ),
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
); 