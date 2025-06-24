import React from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import App from './App';
import Settings from './pages/Settings';
import PopupPage from './pages/PopupPage';
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
  {
    path: '/popup',
    element: <PopupPage />,
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ChatProvider>
      <RouterProvider router={router} />
    </ChatProvider>
  </React.StrictMode>
); 