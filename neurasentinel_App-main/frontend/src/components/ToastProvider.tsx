import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

interface Toast {
  id: number;
  message: string;
  type: 'info' | 'error';
}

interface ToastContextValue {
  showToast: (message: string, type?: 'info' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let toastIdCounter = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'info' | 'error' = 'info') => {
    const id = toastIdCounter++;
    setToasts((prev) => [...prev, { id, message, type }]);
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          zIndex: 60,
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              minWidth: '260px',
              maxWidth: '420px',
              padding: '0.75rem 1rem',
              borderRadius: '0.75rem',
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
              background:
                toast.type === 'error'
                  ? 'linear-gradient(135deg, hsl(0 72% 98%), hsl(0 72% 92%))'
                  : 'linear-gradient(135deg, hsl(0 0% 100%), hsl(0 0% 94%))',
              border:
                toast.type === 'error'
                  ? '1px solid hsl(0 72% 80%)'
                  : '1px solid hsl(0 0% 88%)',
              color: 'hsl(0 0% 15%)',
              fontSize: '0.9rem',
            }}
          >
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
