import { useEffect, useRef, useState } from 'react';
import { Channel, invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store';
import { ArrowLeft, Terminal as TerminalIcon } from 'lucide-react';

export default function ContainerTerminal() {
  const terminalContainerId = useAppStore((s) => s.terminalContainerId);
  const terminalContainerName = useAppStore((s) => s.terminalContainerName);
  const setTerminalContainer = useAppStore((s) => s.setTerminalContainer);

  const [history, setHistory] = useState<TerminalHistoryEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
  }, [history]);

  const executeCommand = async (cmd: string) => {
    const command = cmd.trim();
    if (!command || !terminalContainerId || loading) return;
    if (command === 'exit') {
      setTerminalContainer(null, null);
      return;
    }

    const entryId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setHistory((prev) => [...prev, { id: entryId, cmd: command, output: '', running: true }]);
    setLoading(true);
    try {
      const onEvent = new Channel<TerminalOutputEvent>();
      onEvent.onmessage = ({ data }) => {
        setHistory((prev) => prev.map((entry) => (
          entry.id === entryId ? { ...entry, output: entry.output + data } : entry
        )));
      };
      await invoke<void>('exec_container_stream', {
        id: terminalContainerId,
        command,
        onEvent,
      });
    } catch (e) {
      setHistory((prev) => prev.map((entry) => (
        entry.id === entryId
          ? { ...entry, output: `${entry.output}${entry.output ? '\n' : ''}Error: ${e}` }
          : entry
      )));
    } finally {
      setHistory((prev) => prev.map((entry) => (
        entry.id === entryId
          ? { ...entry, output: entry.output || '(no output)', running: false }
          : entry
      )));
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      executeCommand(input);
      setInput('');
    }
  };

  // Default shell prompt
  useEffect(() => {
    if (terminalContainerId) {
      setHistory([{
        id: 'welcome',
        cmd: '',
        output: `Connected to container: ${terminalContainerName}\nType commands to execute inside the container.\nType 'exit' to close.\n`,
        running: false,
      }]);
    }
  }, [terminalContainerId, terminalContainerName]);

  return (
    <div className="flex flex-col w-screen h-screen min-w-0 bg-zinc-950">
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-950 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTerminalContainer(null, null)}
            className="btn-ghost btn-xs"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <TerminalIcon size={16} className="text-purple-400" />
            <div>
              <h2 className="text-sm font-semibold">Container Terminal</h2>
              <p className="text-xs text-zinc-500">{terminalContainerName}</p>
            </div>
          </div>
        </div>
      </header>

      <div
        ref={outputRef}
        className="flex-1 w-full min-w-0 overflow-auto p-4 font-mono text-sm bg-zinc-950"
        onClick={() => inputRef.current?.focus()}
      >
        {history.map((entry) => (
          <div key={entry.id} className="mb-2 w-full">
            {entry.cmd && (
              <div className="text-green-400">
                <span className="text-purple-400">root@container</span>
                <span className="text-zinc-500">:</span>
                <span className="text-indigo-400">~</span>
                <span className="text-zinc-500">$ </span>
                {entry.cmd}
              </div>
            )}
            <div className="w-full text-zinc-300 whitespace-pre-wrap break-words mt-0.5">{entry.output}</div>
            {entry.running && <span className="inline-block h-4 w-1.5 animate-pulse bg-zinc-500 align-middle" />}
          </div>
        ))}
      </div>

      <div className="flex w-full min-w-0 items-center gap-2 px-4 py-3 border-t border-zinc-800 bg-zinc-950 flex-shrink-0">
        <span className="text-green-400 text-sm font-mono">$</span>
        <input
          ref={inputRef}
          className="flex-1 bg-transparent border-none outline-none text-sm font-mono text-zinc-200 placeholder-zinc-500"
          placeholder="Enter command..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          autoFocus
        />
      </div>
    </div>
  );
}

interface TerminalHistoryEntry {
  id: string;
  cmd: string;
  output: string;
  running: boolean;
}

interface TerminalOutputEvent {
  stream: 'stdout' | 'stderr';
  data: string;
}
