import { useState } from 'react';
import { LogOut, Minus, X } from 'lucide-react';
import { useAppStore } from '../../store';
import { CloseBehavior } from '../../types';
import { translate } from '../../i18n';

interface CloseBehaviorDialogProps {
  open: boolean;
  onCancel: () => void;
  onChoose: (behavior: CloseBehavior, remember: boolean) => void;
}

export default function CloseBehaviorDialog({ open, onCancel, onChoose }: CloseBehaviorDialogProps) {
  const language = useAppStore((s) => s.language);
  const [remember, setRemember] = useState(false);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  const handleCancel = () => {
    setRemember(false);
    onCancel();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="mt-0.5 rounded-lg bg-indigo-500/15 p-2 text-indigo-400">
            <X size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">{t('closeBehaviorTitle')}</h3>
            <p className="mt-1 text-sm leading-6 text-zinc-400">{t('closeBehaviorMessage')}</p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
            title={t('close')}
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-5">
          <button
            type="button"
            className="group flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-3 text-left transition hover:border-cyan-500/50 hover:bg-zinc-800"
            onClick={() => onChoose('minimize', remember)}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-400 transition group-hover:bg-cyan-500/15">
              <Minus size={18} />
            </span>
            <span className="text-sm font-medium text-zinc-200">{t('minimizeToTray')}</span>
          </button>
          <button
            type="button"
            className="group flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-3 text-left transition hover:border-red-500/50 hover:bg-zinc-800"
            onClick={() => onChoose('exit', remember)}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-400 transition group-hover:bg-red-500/15">
              <LogOut size={18} />
            </span>
            <span className="text-sm font-medium text-zinc-200">{t('exitApp')}</span>
          </button>
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 transition hover:border-zinc-700 hover:bg-zinc-900">
            <span className="text-sm text-zinc-300">{t('rememberChoice')}</span>
            <input
              type="checkbox"
              className="peer sr-only"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span
              aria-hidden="true"
              className="relative h-5 w-9 rounded-full bg-zinc-700 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-zinc-300 after:shadow-sm after:transition-transform peer-checked:bg-indigo-600 peer-checked:after:translate-x-4 peer-checked:after:bg-white peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-950"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
