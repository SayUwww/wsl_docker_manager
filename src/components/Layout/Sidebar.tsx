import {
  LayoutDashboard, Box, Image, Network, HardDrive, GitBranch, Settings,
} from 'lucide-react';
import type { ElementType } from 'react';
import { useAppStore } from '../../store';
import { SidebarTab } from '../../types';
import DockerStatusBadge from './DockerStatusBadge';
import { translate } from '../../i18n';

const navItems: { id: SidebarTab; icon: ElementType }[] = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'containers', icon: Box },
  { id: 'images', icon: Image },
  { id: 'networks', icon: Network },
  { id: 'volumes', icon: HardDrive },
];

export default function Sidebar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const containers = useAppStore((s) => s.containers);
  const connectionMode = useAppStore((s) => s.connectionMode);
  const language = useAppStore((s) => s.language);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const runningCount = containers.filter((c) => c.state === 'running').length;
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  return (
    <aside className="w-56 flex-shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col">
      <div className="p-5 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.5 8.55c0 1.52 1.27 2.75 2.84 2.75h9.32c1.57 0 2.84-1.23 2.84-2.75C19.5 7.03 18.23 5.8 16.66 5.8H7.34C5.77 5.8 4.5 7.03 4.5 8.55zM2.85 3.55C1.83 3.55 1 4.33 1 5.3v12.9c0 .97.83 1.75 1.85 1.75h1.85c1.02 0 1.85-.78 1.85-1.75V12.6l4.1 3.75c.36.33.93.33 1.29 0l4.1-3.75v5.6c0 .97.83 1.75 1.85 1.75h1.85c1.02 0 1.85-.78 1.85-1.75V5.3c0-.97-.83-1.75-1.85-1.75h-1.85c-1.02 0-1.85.78-1.85 1.75v5.6l-4.1-3.75a.99.99 0 0 0-1.29 0L5.7 11.35V5.3c0-.97-.83-1.75-1.85-1.75H2.85z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">{t('dockerManager')}</h1>
            <p className="text-xs text-zinc-500">{t('wsl')}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-3 px-2">
        {navItems.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 mb-0.5 ${
              activeTab === id
                ? 'bg-indigo-600/15 text-indigo-400 font-medium'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Icon size={18} />
            {t(id)}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <DockerStatusBadge />
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="flex items-center gap-2">
              <GitBranch size={14} />
              {t('mode')}
            </span>
            <span className="font-mono text-cyan-300 uppercase">{connectionMode}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
            <span>{t('runningContainers')}</span>
            <span className="text-zinc-300 font-mono font-medium">{runningCount}</span>
          </div>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 border border-zinc-800"
          title={t('settings')}
        >
          <Settings size={14} className="text-zinc-500" />
          {t('settings')}
        </button>
      </div>
    </aside>
  );
}
