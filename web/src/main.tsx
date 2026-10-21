import {ThemeProvider} from '@/ui';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {RouterProvider} from 'react-router-dom';
import {AuthProvider} from '@/contexts/AuthContext';
import {ToastProvider} from '@/contexts/ToastContext';
import {router} from '@/routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {refetchOnWindowFocus: false, retry: 1, staleTime: 30_000},
  },
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
