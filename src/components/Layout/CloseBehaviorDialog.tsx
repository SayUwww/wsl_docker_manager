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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="mt-0.5 rounded-lg bg-indigo-500/15 p-2 text-indigo-400">
            <X size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">{t('closeBehaviorTitle')}</h3>
            <p className="mt-1 text-sm leading-6 text-zinc-400">{t('closeBehaviorMessage')}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
            title={t('close')}
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-3 text-left transition hover:border-indigo-500/50 hover:bg-zinc-800"
            onClick={() => onChoose('minimize', remember)}
          >
            <Minus size={18} className="text-cyan-400" />
            <span className="text-sm font-medium text-zinc-200">{t('minimizeToTray')}</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-3 text-left transition hover:border-red-500/50 hover:bg-zinc-800"
            onClick={() => onChoose('exit', remember)}
          >
            <LogOut size={18} className="text-red-400" />
            <span className="text-sm font-medium text-zinc-200">{t('exitApp')}</span>
          </button>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              className="rounded border-zinc-600 bg-zinc-800"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            {t('rememberChoice')}
          </label>
        </div>
      </div>
    </div>
  );
}
