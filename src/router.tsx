import { createHashRouter } from 'react-router-dom';
import { App } from './App';
import { HomePage } from './pages/HomePage';
import { DownloadPage } from './pages/DownloadPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { TOOLS } from './tools/registry';

export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'download', element: <DownloadPage /> },
      ...TOOLS.map((t) => ({
        path: t.route.replace(/^\//, ''),
        element: <t.Page />,
      })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
