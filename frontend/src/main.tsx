import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import { queryClient } from './repositories/queryClient';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Project HomeLab could not find the app root.');
}

const router = createBrowserRouter([{ path: '*', element: <App /> }], { future: { v7_relativeSplatPath: true } });

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </QueryClientProvider>
  </React.StrictMode>,
);
