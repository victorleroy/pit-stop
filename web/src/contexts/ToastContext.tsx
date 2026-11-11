import Portal from '@mui/material/Portal';
import {Alert, Button, Stack} from '@/ui';
import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import type {ReactNode} from 'react';

const DISMISS_AFTER_MS = 6_000;

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  action?: ToastAction;
  id: number;
  message: string;
  severity: 'error' | 'info' | 'success';
}

interface ToastContextValue {
  error: (message: string) => void;
  info: (message: string) => void;
  success: (message: string, action?: ToastAction) => void;
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
    (severity: Toast['severity'], message: string, action?: ToastAction) => {
      const id = Date.now() + Math.random();

      setToasts((current) => [...current.slice(-2), {action, id, message, severity}]);
      window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  // Transient feedback never traps: Escape clears it without taking focus.
  useEffect(() => {
    if (!toasts.some(({severity}) => severity === 'info')) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setToasts((current) => current.filter(({severity}) => severity !== 'info'));
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toasts]);

  const value = useMemo(
    () => ({
      error: (message: string) => push('error', message),
      info: (message: string) => push('info', message),
      success: (message: string, action?: ToastAction) => push('success', message, action),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toasts.length ? (
        <Portal>
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
                action={
                  toast.action ? (
                    <Button
                      color="inherit"
                      onClick={() => {
                        toast.action?.onClick();
                        dismiss(toast.id);
                      }}
                      size="small"
                    >
                      {toast.action.label}
                    </Button>
                  ) : undefined
                }
                key={toast.id}
                onClick={() => dismiss(toast.id)}
                onClose={() => dismiss(toast.id)}
                severity={toast.severity}
                sx={{
                  boxShadow: '0 10px 30px -12px rgba(15, 23, 42, 0.55)',
                  maxWidth: 560,
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  width: '100%',
                }}
              >
                {toast.message}
              </Alert>
            ))}
          </Stack>
        </Portal>
      ) : null}
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
