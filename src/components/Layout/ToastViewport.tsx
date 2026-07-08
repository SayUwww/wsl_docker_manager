import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useAppStore } from '../../store';
import { ToastMessage } from '../../types';
import { translate } from '../../i18n';

export default function ToastViewport() {
  const toasts = useAppStore((s) => s.toasts);

  return (
    <div
      className="pointer-events-none fixed right-5 top-5 z-50 flex w-[min(420px,calc(100vw-2.5rem))] flex-col gap-2"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastMessage }) {
  const removeToast = useAppStore((s) => s.removeToast);
  const language = useAppStore((s) => s.language);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  useEffect(() => {
    const timer = window.setTimeout(() => removeToast(toast.id), 3000);
    return () => window.clearTimeout(timer);
  }, [removeToast, toast.id]);

  const style = toastStyle(toast.type);
  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info;

  return (
    <div
      className={`pointer-events-auto overflow-hidden rounded-lg border bg-zinc-950/95 shadow-xl shadow-black/40 backdrop-blur ${style.border}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
    >
      <div className="flex items-start gap-3 p-3">
        <Icon size={18} className={`mt-0.5 shrink-0 ${style.icon}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-100">{toast.title}</div>
          {toast.message && (
            <div className="mt-1 max-h-28 overflow-auto break-words text-xs leading-5 text-zinc-400">
              {toast.message}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => removeToast(toast.id)}
          className="rounded p-0.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
          title={t('close')}
        >
          <X size={14} />
        </button>
      </div>
      <div className={`h-0.5 ${style.progress}`} />
    </div>
  );
}

function toastStyle(type: ToastMessage['type']) {
  switch (type) {
    case 'success':
      return {
        border: 'border-green-500/30',
        icon: 'text-green-400',
        progress: 'bg-green-500/60',
      };
    case 'error':
      return {
        border: 'border-red-500/35',
        icon: 'text-red-400',
        progress: 'bg-red-500/70',
      };
    default:
      return {
        border: 'border-indigo-500/30',
        icon: 'text-indigo-400',
        progress: 'bg-indigo-500/60',
      };
  }
}
