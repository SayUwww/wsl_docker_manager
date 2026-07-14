import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useAppStore } from '../../store';
import { LogEntry } from '../../types';
import { ArrowLeft, Search, Download, X, RefreshCw, Eraser } from 'lucide-react';
import { translate } from '../../i18n';

const LOG_COLORS: Record<string, string> = {
  stdout: 'text-zinc-300',
  stderr: 'text-red-400',
  info: 'text-cyan-400',
  warn: 'text-amber-400',
  warning: 'text-amber-400',
  error: 'text-red-500',
  debug: 'text-zinc-500',
  fatal: 'text-red-600 font-bold',
  critical: 'text-red-600 font-bold',
};

type AutoRefreshMs = 0 | 2000 | 5000 | 10000 | 30000;

function getLogClass(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('error') || lower.includes('fatal') || lower.includes('critical') || lower.includes('fail')) return LOG_COLORS.error;
  if (lower.includes('warn')) return LOG_COLORS.warn;
  if (lower.includes('info')) return LOG_COLORS.info;
  if (lower.includes('debug')) return LOG_COLORS.debug;
  return LOG_COLORS.stdout;
}

export default function ContainerLogs() {
  const logContainerId = useAppStore((s) => s.logContainerId);
  const logContainerName = useAppStore((s) => s.logContainerName);
  const setLogContainer = useAppStore((s) => s.setLogContainer);
  const language = useAppStore((s) => s.language);
  const addToast = useAppStore((s) => s.addToast);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  const [logs, setLogs] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tailLines, setTailLines] = useState(500);
  const [autoRefreshMs, setAutoRefreshMs] = useState<AutoRefreshMs>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const refreshRequestRef = useRef(0);
  const activeRefreshesRef = useRef(0);
  const [autoScroll, setAutoScroll] = useState(true);

  const refreshLogs = useCallback(async () => {
    if (!logContainerId) return;

    const requestId = ++refreshRequestRef.current;
    activeRefreshesRef.current += 1;
    setRefreshing(true);
    try {
      const result = await invoke<LogEntry[]>('get_container_logs', {
        id: logContainerId,
        tail: tailLines,
      });
      if (requestId === refreshRequestRef.current) {
        setLogs(result.map((entry) => `[${entry.timestamp}] ${entry.message}`));
      }
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    } finally {
      activeRefreshesRef.current = Math.max(0, activeRefreshesRef.current - 1);
      if (requestId === refreshRequestRef.current) {
        setRefreshing(false);
      }
    }
  }, [logContainerId, tailLines]);

  useEffect(() => {
    refreshLogs();

    return () => {
      refreshRequestRef.current += 1;
    };
  }, [refreshLogs]);

  useEffect(() => {
    if (autoRefreshMs === 0) return;
    const interval = window.setInterval(() => {
      if (activeRefreshesRef.current === 0) refreshLogs();
    }, autoRefreshMs);
    return () => window.clearInterval(interval);
  }, [autoRefreshMs, refreshLogs]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = useMemo(() => {
    if (!searchTerm) return logs;
    return logs.filter((line) => line.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [logs, searchTerm]);

  const highlightedLogs = useMemo(() => {
    if (!searchTerm) return filteredLogs;
    return filteredLogs.map((line) => {
      const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return line.replace(regex, '\x00$1\x01');
    });
  }, [filteredLogs, searchTerm]);

  const handleExport = useCallback(async () => {
    if (logs.length === 0) return;

    const safeName = (logContainerName || 'container').replace(/[<>:"/\\|?*]/g, '_');
    try {
      const path = await save({
        defaultPath: `${safeName}-logs-${Date.now()}.txt`,
        filters: [{ name: 'Text', extensions: ['txt', 'log'] }],
      });
      if (!path) return;
      await writeTextFile(path, logs.join('\n'));
      addToast({ type: 'success', title: `${t('export')} ${t('completed')}`, message: path });
    } catch (error) {
      console.error('Failed to export logs:', error);
      addToast({ type: 'error', title: `${t('export')} ${t('failed')}`, message: String(error) });
    }
  }, [addToast, logs, logContainerName, t]);

  const handleClear = () => setLogs([]);

  return (
    <div className="flex h-screen w-screen min-h-0 min-w-0 flex-col bg-zinc-950">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLogContainer(null, null)}
            className="btn-ghost btn-xs"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-sm font-semibold">{t('containerLogs')}</h2>
            <p className="text-xs text-zinc-500">{logContainerName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              className="input pl-8 py-1.5 text-xs w-56"
              placeholder={t('searchLogs')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={refreshLogs}
            disabled={refreshing}
            className="btn-ghost btn-xs"
            title={refreshing ? t('refreshing') : t('refresh')}
            aria-label={refreshing ? t('refreshing') : t('refresh')}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleClear} className="btn-ghost btn-xs" title={t('clear')}>
            <Eraser size={14} />
          </button>
          <button
            onClick={handleExport}
            disabled={logs.length === 0}
            className="btn-ghost btn-xs"
            title={t('export')}
          >
            <Download size={14} />
          </button>
        </div>
      </header>

      {/* Log output */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-5"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 50);
        }}
      >
        {highlightedLogs.map((line, i) => {
          const parts = line.split(/\x00(?=[^\x01]*\x01)/);
          return (
            <div key={i} className={`whitespace-pre-wrap break-all ${getLogClass(line)} hover:bg-zinc-800/30`}>
              {parts.map((part, j) => {
                const end = part.indexOf('\x01');
                if (end > -1) {
                  const match = part.slice(0, end);
                  const rest = part.slice(end + 1);
                  return (
                    <span key={j}>
                      <mark className="bg-amber-500/30 text-amber-200 rounded-sm">{match}</mark>
                      {rest}
                    </span>
                  );
                }
                return <span key={j}>{part}</span>;
              })}
            </div>
          );
        })}
        {filteredLogs.length === 0 && (
          <div className="flex h-full min-h-48 items-center justify-center text-zinc-600">
            {logs.length === 0 ? t('waitingForLogs') : t('noMatchingLogEntries')}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-6 py-1.5 text-xs text-zinc-500">
        <span>{logs.length} {t('lines')}</span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5">
            {t('autoRefresh')}:
            <select
              value={autoRefreshMs}
              onChange={(event) => setAutoRefreshMs(Number(event.target.value) as AutoRefreshMs)}
              className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-xs"
            >
              <option value={0}>{t('never')}</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            {t('tail')}:
            <select
              value={tailLines}
              onChange={(e) => setTailLines(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs"
            >
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value={5000}>5000</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
