import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Activity, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import { useAppStore } from '../../store';
import { translate } from '../../i18n';
import { ConnectionMode, ContainerInfo, DockerInfo, ExecutionLog, ImageInfo, NetworkInfo, ResourceStats, VolumeInfo } from '../../types';
import { describeDockerCommand } from '../../utils/executionLog';

export default function ExecutionLogPanel() {
  const logs = useAppStore((s) => s.executionLogs);
  const clearExecutionLogs = useAppStore((s) => s.clearExecutionLogs);
  const addExecutionLog = useAppStore((s) => s.addExecutionLog);
  const addToast = useAppStore((s) => s.addToast);
  const language = useAppStore((s) => s.language);
  const [selectedLog, setSelectedLog] = useState<ExecutionLog | null>(null);
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  const retryLog = useCallback(async (log: ExecutionLog) => {
    if (retryingLogId) return;

    setRetryingLogId(log.id);
    const started = performance.now();
    try {
      const result = await invoke<unknown>(log.command, log.args);
      addExecutionLog({
        command: log.command,
        displayCommand: describeDockerCommand(log.command, log.args),
        args: log.args,
        status: 'ok',
        durationMs: Math.round(performance.now() - started),
      });
      await applyCommandResult(log.command, result);
      await refreshAfterMutation(log.command);
      addToast({ type: 'success', title: t('rerunCompleted'), message: log.command });
    } catch (error) {
      addExecutionLog({
        command: log.command,
        displayCommand: describeDockerCommand(log.command, log.args),
        args: log.args,
        status: 'error',
        durationMs: Math.round(performance.now() - started),
        message: String(error),
      });
      addToast({ type: 'error', title: t('rerunFailed'), message: String(error) });
    } finally {
      setRetryingLogId(null);
    }
  }, [addExecutionLog, addToast, retryingLogId, t]);

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
                <tr
                  key={log.id}
                  className="cursor-pointer border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30"
                  onClick={() => setSelectedLog(log)}
                >
                  <td className="py-2 px-4 text-zinc-500 font-mono whitespace-nowrap">{log.time}</td>
                  <td className="py-2 px-3 text-zinc-300 font-mono">{log.displayCommand || describeDockerCommand(log.command, log.args)}</td>
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
      {selectedLog && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50">
            <div className="flex items-start gap-3 border-b border-zinc-800 px-4 py-3">
              <div className={`mt-0.5 rounded-lg p-2 ${selectedLog.status === 'ok' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                <Activity size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-zinc-100">{t('executionLogDetail')}</h3>
                <p className="mt-1 truncate font-mono text-xs text-zinc-500">{selectedLog.displayCommand || describeDockerCommand(selectedLog.command, selectedLog.args)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
                title={t('close')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[65vh] overflow-auto px-4 py-4">
              <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                <LogMeta label={t('status')} value={selectedLog.status} tone={selectedLog.status === 'ok' ? 'text-green-400' : 'text-red-400'} />
                <LogMeta label={t('duration')} value={`${selectedLog.durationMs}ms`} />
                <LogMeta label={t('time')} value={selectedLog.time} />
                <LogMeta label={t('command')} value={selectedLog.displayCommand || describeDockerCommand(selectedLog.command, selectedLog.args)} mono />
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-medium text-zinc-500">{t('arguments')}</div>
                <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs leading-5 text-zinc-300">
                  {formatArgs(selectedLog.args)}
                </pre>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-medium text-zinc-500">{t('runtimeMessage')}</div>
                <pre className={`max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border p-3 text-xs leading-5 ${
                  selectedLog.message
                    ? 'border-red-500/25 bg-red-950/20 text-red-200'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                }`}>
                  {selectedLog.message || t('noRuntimeMessage')}
                </pre>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-800 px-4 py-3">
              <button type="button" className="btn-secondary text-xs" onClick={() => setSelectedLog(null)}>
                {t('close')}
              </button>
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={retryingLogId !== null}
                onClick={() => retryLog(selectedLog)}
              >
                {retryingLogId === selectedLog.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RotateCcw size={14} className="mr-1" />}
                {t('rerun')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}

function LogMeta({ label, value, tone = 'text-zinc-300', mono = false }: { label: string; value: string; tone?: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="mb-1 text-[10px] uppercase text-zinc-500">{label}</div>
      <div className={`truncate text-xs ${tone} ${mono ? 'font-mono' : ''}`} title={value}>{value}</div>
    </div>
  );
}

function formatArgs(args: Record<string, unknown> | undefined): string {
  if (!args || Object.keys(args).length === 0) return '{}';
  return JSON.stringify(args, null, 2);
}

async function applyCommandResult(command: string, result: unknown) {
  const store = useAppStore.getState();

  switch (command) {
    case 'list_containers':
      store.setContainers(result as ContainerInfo[]);
      break;
    case 'list_images':
      store.setImages(result as ImageInfo[]);
      break;
    case 'list_networks':
      store.setNetworks(result as NetworkInfo[]);
      break;
    case 'list_volumes':
      store.setVolumes(result as VolumeInfo[]);
      break;
    case 'get_resource_stats':
      store.setResourceStats(result as ResourceStats);
      break;
    case 'get_connection_mode':
    case 'set_connection_mode':
      store.setConnectionMode((result as { mode: ConnectionMode }).mode);
      break;
    case 'get_docker_status': {
      const status = result as { connected: boolean; info: DockerInfo | null };
      store.setDockerStatus(status.connected ? 'connected' : 'disconnected');
      store.setDockerInfo(status.info ?? null);
      break;
    }
    default:
      break;
  }
}

async function refreshAfterMutation(command: string) {
  const store = useAppStore.getState();

  if (command.includes('container') && command !== 'list_containers') {
    store.setContainers(await invoke<ContainerInfo[]>('list_containers', { all: true }));
  }
  if ((command.includes('image') || command.includes('images')) && command !== 'list_images') {
    store.setImages(await invoke<ImageInfo[]>('list_images'));
  }
  if (command.includes('network') && command !== 'list_networks') {
    store.setNetworks(await invoke<NetworkInfo[]>('list_networks'));
  }
  if ((command.includes('volume') || command.includes('volumes')) && command !== 'list_volumes') {
    store.setVolumes(await invoke<VolumeInfo[]>('list_volumes', { containerIds: [] }));
  }
}
