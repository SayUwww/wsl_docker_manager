import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store';
import { LogEntry } from '../../types';
import { ArrowLeft, Search, Download, X, Play, Pause, Eraser } from 'lucide-react';
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
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  const [logs, setLogs] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paused, setPaused] = useState(false);
  const [tailLines, setTailLines] = useState(500);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!logContainerId) return;

    let buffer: string[] = [];
    let active = true;

    // Fetch initial logs via spawn
    const fetchLogs = async () => {
      try {
        const result = await invoke<LogEntry[]>('get_container_logs', {
          id: logContainerId,
          tail: tailLines,
        });
        if (active) {
          buffer = result.map((e) => `[${e.timestamp}] ${e.message}`);
          setLogs([...buffer]);
        }
      } catch (e) {
        console.error('Failed to fetch logs:', e);
      }
    };

    fetchLogs();

    return () => {
      active = false;
    };
  }, [logContainerId, tailLines]);

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

  const handleExport = useCallback(() => {
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${logContainerName || 'container'}-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs, logContainerName]);

  const handleClear = () => setLogs([]);

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-950">
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
          <button onClick={() => setPaused(!paused)} className={`btn-ghost btn-xs ${paused ? 'text-amber-400' : ''}`}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button onClick={handleClear} className="btn-ghost btn-xs" title={t('clear')}>
            <Eraser size={14} />
          </button>
          <button onClick={handleExport} className="btn-ghost btn-xs" title={t('export')}>
            <Download size={14} />
          </button>
        </div>
      </header>

      {/* Log output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-4 font-mono text-xs leading-5"
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
          <div className="flex items-center justify-center h-full text-zinc-600">
            {logs.length === 0 ? t('waitingForLogs') : t('noMatchingLogEntries')}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-6 py-1.5 border-t border-zinc-800 bg-zinc-950 text-xs text-zinc-500">
        <span>{logs.length} {t('lines')}</span>
        <div className="flex items-center gap-4">
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
          <span>{paused ? t('paused') : t('streaming')}</span>
        </div>
      </div>
    </div>
  );
}
