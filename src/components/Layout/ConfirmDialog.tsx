import { AlertTriangle, X } from 'lucide-react';
import { useAppStore } from '../../store';
import { translate } from '../../i18n';

export default function ConfirmDialog() {
  const confirmation = useAppStore((s) => s.confirmation);
  const resolveConfirmation = useAppStore((s) => s.resolveConfirmation);
  const language = useAppStore((s) => s.language);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  if (!confirmation) return null;

  const danger = confirmation.variant !== 'default';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3 border-b border-zinc-800 px-4 py-3">
          <div className={`mt-0.5 rounded-lg p-2 ${danger ? 'bg-red-500/15 text-red-400' : 'bg-indigo-500/15 text-indigo-400'}`}>
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">{confirmation.title}</h3>
            <p className="mt-1 break-words text-sm leading-6 text-zinc-400">{confirmation.message}</p>
          </div>
          <button
            type="button"
            onClick={() => resolveConfirmation(false)}
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
            title={t('close')}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3">
          <button type="button" className="btn-secondary text-xs" onClick={() => resolveConfirmation(false)}>
            {confirmation.cancelText || t('cancel')}
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger text-xs' : 'btn-primary text-xs'}
            onClick={() => resolveConfirmation(true)}
          >
            {confirmation.confirmText || t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
