import { Loader2 } from 'lucide-react';
import { useAppStore } from '../../store';

export default function GlobalLoadingOverlay() {
  const message = useAppStore((s) => s.globalLoadingMessage);

  if (!message) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex cursor-wait items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex min-w-56 items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-950 px-5 py-4 shadow-2xl shadow-black/50">
        <Loader2 size={22} className="shrink-0 animate-spin text-indigo-400" />
        <span className="text-sm font-medium text-zinc-100">{message}</span>
      </div>
    </div>
  );
}
