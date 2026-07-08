import {
  LayoutDashboard, Box, Image, Network, HardDrive, GitBranch, Moon, Sun,
} from 'lucide-react';
import type { ElementType } from 'react';
import { useAppStore } from '../../store';
import { SidebarTab } from '../../types';
import DockerStatusBadge from './DockerStatusBadge';
import { useDocker } from '../../hooks/useDocker';
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
  const setLanguage = useAppStore((s) => s.setLanguage);
  const refreshIntervalMs = useAppStore((s) => s.refreshIntervalMs);
  const setRefreshIntervalMs = useAppStore((s) => s.setRefreshIntervalMs);
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const addToast = useAppStore((s) => s.addToast);
  const { setConnectionMode } = useDocker();
  const runningCount = containers.filter((c) => c.state === 'running').length;
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const handleRefreshIntervalChange = (value: 10000 | 30000 | 60000) => {
    setRefreshIntervalMs(value);
    addToast({ type: 'info', title: t('refreshIntervalUpdated'), message: `${value / 1000}s` });
  };
  const handleLanguageChange = (value: 'system' | 'zh' | 'ja' | 'en') => {
    setLanguage(value);
    addToast({ type: 'info', title: translate(value, 'languageUpdated'), message: value });
  };
  const handleConnectionModeToggle = () => {
    const nextMode = connectionMode === 'wsl' ? 'direct' : 'wsl';
    setConnectionMode(nextMode);
    addToast({ type: 'info', title: t('connectionModeSwitched'), message: nextMode.toUpperCase() });
  };
  const handleThemeToggle = () => {
    const nextMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextMode);
    addToast({ type: 'info', title: t('themeSwitched'), message: nextMode === 'dark' ? t('dark') : t('light') });
  };

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
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="block text-xs text-zinc-500 mb-1">{t('refresh')}</span>
            <select
              value={refreshIntervalMs}
              onChange={(e) => handleRefreshIntervalChange(Number(e.target.value) as 10000 | 30000 | 60000)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
            >
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
              <option value={60000}>60s</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-zinc-500 mb-1">{t('language')}</span>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value as 'system' | 'zh' | 'ja' | 'en')}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="system">{t('system')}</option>
              <option value="zh">{t('chinese')}</option>
              <option value="ja">{t('japanese')}</option>
              <option value="en">{t('english')}</option>
            </select>
          </label>
        </div>
        <button
          onClick={handleConnectionModeToggle}
          className="mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 border border-zinc-800"
          title={t('toggleConnectionMode')}
        >
          <span className="flex items-center gap-2">
            <GitBranch size={14} className="text-zinc-500" />
            {t('mode')}
          </span>
          <span className="font-mono text-cyan-300 uppercase">{connectionMode}</span>
        </button>
        <button
          onClick={handleThemeToggle}
          className="mt-2 w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 border border-zinc-800"
          title={t('toggleTheme')}
        >
          <span className="flex items-center gap-2">
            {themeMode === 'dark' ? <Moon size={14} className="text-zinc-500" /> : <Sun size={14} className="text-amber-500" />}
            {t('theme')}
          </span>
          <span className="font-mono text-cyan-300 uppercase">{themeMode === 'dark' ? t('dark') : t('light')}</span>
        </button>
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
          <span>{t('runningContainers')}</span>
          <span className="text-zinc-300 font-mono font-medium">{runningCount}</span>
        </div>
      </div>
    </aside>
  );
}
