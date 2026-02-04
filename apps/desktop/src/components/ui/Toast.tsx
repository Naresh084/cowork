import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    return id;
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  clearToasts: () => {
    set({ toasts: [] });
  },
}));

// Convenience functions
export const toast = {
  success: (title: string, description?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'success', title, description, duration }),
  error: (title: string, description?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'error', title, description, duration }),
  warning: (title: string, description?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'warning', title, description, duration }),
  info: (title: string, description?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'info', title, description, duration }),
  dismiss: (id: string) => useToastStore.getState().removeToast(id),
  dismissAll: () => useToastStore.getState().clearToasts(),
};

const TOAST_ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_STYLES: Record<ToastType, string> = {
  success: 'border-[#50956A]/30 bg-[#50956A]/10',
  error: 'border-[#FF5449]/30 bg-[#FF5449]/10',
  warning: 'border-[#F5C400]/30 bg-[#F5C400]/10',
  info: 'border-[#4C71FF]/30 bg-[#4C71FF]/10',
};

const TOAST_ICON_STYLES: Record<ToastType, string> = {
  success: 'text-[#6BB88A]',
  error: 'text-[#FF7A72]',
  warning: 'text-[#FFD700]',
  info: 'text-[#8CA2FF]',
};

const PROGRESS_BAR_COLORS: Record<ToastType, string> = {
  success: 'bg-[#50956A]',
  error: 'bg-[#FF5449]',
  warning: 'bg-[#F5C400]',
  info: 'bg-[#4C71FF]',
};

interface ToastItemProps {
  toast: Toast;
  onRemove: () => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = TOAST_ICONS[toast.type];
  // Error toasts persist until manually dismissed (duration = 0)
  // Other toasts auto-dismiss: success/info after 4s, warning after 6s
  const duration = toast.duration ?? (toast.type === 'error' ? 0 : toast.type === 'warning' ? 6000 : 4000);

  const handleRemove = useCallback(() => {
    setIsExiting(true);
    setTimeout(onRemove, 200);
  }, [onRemove]);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(handleRemove, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, handleRemove]);

  return (
    <div
      className={cn(
        'relative w-80 p-4 rounded-xl border shadow-xl',
        'bg-[#151518] backdrop-blur-sm',
        TOAST_STYLES[toast.type],
        'animate-in slide-in-from-right-full duration-300',
        isExiting && 'animate-out slide-out-to-right-full duration-200'
      )}
      role="alert"
    >
      <div className="flex gap-3">
        <Icon className={cn('flex-shrink-0 mt-0.5', TOAST_ICON_STYLES[toast.type])} size={18} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/90">{toast.title}</p>
          {toast.description && (
            <p className="mt-1 text-sm text-white/50">{toast.description}</p>
          )}
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick();
                handleRemove();
              }}
              className="mt-2 text-sm font-medium text-[#8CA2FF] hover:text-[#A4A6FF] transition-colors"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          onClick={handleRemove}
          className="flex-shrink-0 p-1 text-white/40 hover:text-white/70 transition-colors rounded"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      {/* Progress bar */}
      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-b-xl">
          <div
            className={cn('h-full', PROGRESS_BAR_COLORS[toast.type])}
            style={{
              animation: `toast-progress ${duration}ms linear forwards`,
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
      ))}
    </div>,
    document.body
  );
}
