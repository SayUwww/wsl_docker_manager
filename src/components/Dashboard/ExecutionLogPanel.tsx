import { Activity, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store';
import { translate } from '../../i18n';

export default function ExecutionLogPanel() {
  const logs = useAppStore((s) => s.executionLogs);
  const clearExecutionLogs = useAppStore((s) => s.clearExecutionLogs);
  const language = useAppStore((s) => s.language);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  return (
    <section className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Activity size={16} className="text-cyan-400" />
          {t('executionLog')}
        </h3>
        <button
          onClick={clearExecutionLogs}
          className="btn-ghost btn-xs text-zinc-500 hover:text-zinc-300"
          title={t('clear')}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="max-h-72 overflow-auto">
        {logs.length > 0 ? (
          <table className="w-full text-xs">
            <tbody>
              {logs.slice(0, 30).map((log) => (
                <tr key={log.id} className="border-b border-zinc-800/50">
                  <td className="py-2 px-4 text-zinc-500 font-mono whitespace-nowrap">{log.time}</td>
                  <td className="py-2 px-3 text-zinc-300 font-mono">{log.command}</td>
                  <td className="py-2 px-3 text-right text-zinc-500 font-mono whitespace-nowrap">
                    {log.durationMs}ms
                  </td>
                  <td className="py-2 px-4 text-right whitespace-nowrap">
                    <span className={log.status === 'ok' ? 'text-green-400' : 'text-red-400'}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center text-zinc-500 text-sm">{t('noExecutionLogs')}</div>
        )}
      </div>
    </section>
  );
}
