import {Alert, Stack} from '@/ui';
import {createContext, useCallback, useContext, useMemo, useState} from 'react';
import type {ReactNode} from 'react';

const DISMISS_AFTER_MS = 6_000;

interface Toast {
  id: number;
  message: string;
  severity: 'error' | 'success';
}

interface ToastContextValue {
  error: (message: string) => void;
  success: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * Transient feedback belongs over the page, not inside the layout: an inline alert pushes
 * everything down, and tends to outstay the problem it describes.
 */
export const ToastProvider = ({children}: {children: ReactNode}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (severity: Toast['severity'], message: string) => {
      const id = Date.now() + Math.random();

      setToasts((current) => [...current.slice(-2), {id, message, severity}]);
      window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      error: (message: string) => push('error', message),
      success: (message: string) => push('success', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <Stack
        spacing={1}
        sx={{
          alignItems: 'center',
          bottom: 24,
          left: 0,
          pointerEvents: 'none',
          position: 'fixed',
          px: 2,
          right: 0,
          zIndex: 1400,
        }}
      >
        {toasts.map((toast) => (
          <Alert
            key={toast.id}
            onClose={() => dismiss(toast.id)}
            severity={toast.severity}
            sx={{
              boxShadow: '0 10px 30px -12px rgba(15, 23, 42, 0.55)',
              maxWidth: 560,
              pointerEvents: 'auto',
              width: '100%',
            }}
          >
            {toast.message}
          </Alert>
        ))}
      </Stack>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
};
