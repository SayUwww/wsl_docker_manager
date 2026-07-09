import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import {
  Check,
  KeyRound,
  Loader2,
  MonitorCog,
  Plus,
  Power,
  Save,
  Server,
  Trash2,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { translate } from '../../i18n';
import { CloseBehavior, ConnectionMode, Language, RemoteConfig, RemoteProfile, RefreshIntervalMs, ThemeMode } from '../../types';
import { useDocker } from '../../hooks/useDocker';

type SettingsSection = 'system' | 'remote';

const emptyProfile = (): RemoteProfile => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  name: '',
  host: '',
  port: 22,
  username: '',
  authType: 'privateKey',
  password: '',
  privateKeyPath: '',
  passphrase: '',
  dockerSocket: '/var/run/docker.sock',
});

export default function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const refreshIntervalMs = useAppStore((s) => s.refreshIntervalMs);
  const setRefreshIntervalMs = useAppStore((s) => s.setRefreshIntervalMs);
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const connectionMode = useAppStore((s) => s.connectionMode);
  const closeBehavior = useAppStore((s) => s.closeBehavior);
  const setCloseBehavior = useAppStore((s) => s.setCloseBehavior);
  const remoteConfig = useAppStore((s) => s.remoteConfig);
  const setRemoteConfig = useAppStore((s) => s.setRemoteConfig);
  const setGlobalLoading = useAppStore((s) => s.setGlobalLoading);
  const addToast = useAppStore((s) => s.addToast);
  const { setConnectionMode } = useDocker();
  const [section, setSection] = useState<SettingsSection>('system');
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [loadingAutoStart, setLoadingAutoStart] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [draft, setDraft] = useState<RemoteProfile>(emptyProfile);
  const t = useCallback((key: Parameters<typeof translate>[1]) => translate(language, key), [language]);

  const selectedProfile = useMemo(
    () => remoteConfig.profiles.find((profile) => profile.id === remoteConfig.selectedProfileId) ?? null,
    [remoteConfig],
  );

  useEffect(() => {
    if (!open) return;

    isEnabled()
      .then(setAutoStartEnabled)
      .catch(() => setAutoStartEnabled(false));
    invoke<RemoteConfig>('get_remote_config')
      .then((config) => {
        setRemoteConfig(config);
        setDraft(config.profiles.find((profile) => profile.id === config.selectedProfileId) ?? emptyProfile());
      })
      .catch((error) => addToast({ type: 'error', title: t('refreshFailed'), message: String(error) }));
  }, [addToast, open, setRemoteConfig, t]);

  const handleAutoStartChange = useCallback(async (checked: boolean) => {
    setLoadingAutoStart(true);
    try {
      if (checked) await enable();
      else await disable();
      setAutoStartEnabled(await isEnabled());
      addToast({ type: 'success', title: t('autoStartUpdated') });
    } catch (error) {
      addToast({ type: 'error', title: t('failed'), message: String(error) });
    } finally {
      setLoadingAutoStart(false);
    }
  }, [addToast, t]);

  const handleConnectionModeChange = useCallback(async (mode: ConnectionMode) => {
    if (mode === connectionMode) return;
    setGlobalLoading(t('connecting'));
    try {
      await setConnectionMode(mode);
      addToast({ type: 'info', title: t('connectionModeSwitched'), message: mode.toUpperCase() });
    } catch (error) {
      addToast({ type: 'error', title: t('failed'), message: String(error) });
    } finally {
      setGlobalLoading(null);
    }
  }, [addToast, connectionMode, setConnectionMode, setGlobalLoading, t]);

  const handleLanguageChange = useCallback((value: Language) => {
    setLanguage(value);
    addToast({ type: 'info', title: translate(value, 'languageUpdated'), message: value });
  }, [addToast, setLanguage]);

  const handleThemeChange = useCallback((value: ThemeMode) => {
    setThemeMode(value);
    addToast({ type: 'info', title: t('themeSwitched'), message: value === 'dark' ? t('dark') : t('light') });
  }, [addToast, setThemeMode, t]);

  const saveRemote = useCallback(async () => {
    setLoadingRemote(true);
    const profile = normalizeProfile(draft);
    const shouldReloadRemote = connectionMode === 'remote' && remoteConfig.selectedProfileId === profile.id;
    if (shouldReloadRemote) setGlobalLoading(t('connecting'));
    try {
      const config = await invoke<RemoteConfig>('save_remote_profile', { profile });
      setRemoteConfig(config);
      setDraft(profile);
      if (shouldReloadRemote) {
        await setConnectionMode('remote');
      }
      addToast({ type: 'success', title: t('remoteSaved'), message: profile.name || profile.host });
    } catch (error) {
      addToast({ type: 'error', title: t('failed'), message: String(error) });
    } finally {
      if (shouldReloadRemote) setGlobalLoading(null);
      setLoadingRemote(false);
    }
  }, [addToast, connectionMode, draft, remoteConfig.selectedProfileId, setConnectionMode, setGlobalLoading, setRemoteConfig, t]);

  const deleteRemote = useCallback(async (id: string) => {
    setLoadingRemote(true);
    try {
      const config = await invoke<RemoteConfig>('delete_remote_profile', { id });
      setRemoteConfig(config);
      setDraft(config.profiles.find((profile) => profile.id === config.selectedProfileId) ?? emptyProfile());
      addToast({ type: 'success', title: t('remoteDeleted') });
    } catch (error) {
      addToast({ type: 'error', title: t('failed'), message: String(error) });
    } finally {
      setLoadingRemote(false);
    }
  }, [addToast, setRemoteConfig, t]);

  const selectRemote = useCallback(async (id: string) => {
    setLoadingRemote(true);
    const shouldReloadRemote = connectionMode === 'remote' && remoteConfig.selectedProfileId !== id;
    if (shouldReloadRemote) setGlobalLoading(t('connecting'));
    try {
      const config = await invoke<RemoteConfig>('select_remote_profile', { id });
      setRemoteConfig(config);
      setDraft(config.profiles.find((profile) => profile.id === id) ?? emptyProfile());
      if (shouldReloadRemote) {
        await setConnectionMode('remote');
      }
      addToast({ type: 'success', title: t('remoteSelected') });
    } catch (error) {
      addToast({ type: 'error', title: t('failed'), message: String(error) });
    } finally {
      if (shouldReloadRemote) setGlobalLoading(null);
      setLoadingRemote(false);
    }
  }, [addToast, connectionMode, remoteConfig.selectedProfileId, setConnectionMode, setGlobalLoading, setRemoteConfig, t]);

  const testRemote = useCallback(async () => {
    setLoadingRemote(true);
    try {
      const result = await invoke<{ message: string }>('test_remote_profile', { profile: normalizeProfile(draft) });
      addToast({ type: 'success', title: t('remoteTestPassed'), message: result.message });
    } catch (error) {
      addToast({ type: 'error', title: t('remoteTestFailed'), message: String(error) });
    } finally {
      setLoadingRemote(false);
    }
  }, [addToast, draft, t]);

  if (!open) return null;

  const sectionTitle = section === 'system' ? t('systemSettings') : t('remoteSettings');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="relative flex h-[min(780px,calc(100vh-3rem))] w-full max-w-5xl overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50">
        <button
          type="button"
          className="absolute right-3 top-3 z-10 rounded-md p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-100"
          onClick={() => setOpen(false)}
          title={t('close')}
        >
          <X size={18} />
        </button>

        <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
          <div className="border-b border-zinc-800 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-100">{t('settings')}</h2>
            <div className="mt-1 h-0.5 w-8 rounded-full bg-indigo-500" />
          </div>
          <div className="flex-1 p-3">
            <SettingsNavButton active={section === 'system'} icon={<MonitorCog size={16} />} label={t('systemSettings')} onClick={() => setSection('system')} />
            <SettingsNavButton active={section === 'remote'} icon={<Server size={16} />} label={t('remoteSettings')} onClick={() => setSection('remote')} />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-zinc-950">
          <header className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-5 py-4 pr-14">
            <h3 className="text-base font-semibold text-zinc-100">{sectionTitle}</h3>
          </header>

          <div className="min-h-0 flex-1 overflow-auto p-5">
          {section === 'system' && (
            <div className="space-y-5">
              <SettingsGroup title={t('systemSettings')}>
                <Field label={t('mode')}>
                  <select
                    className="input"
                    value={connectionMode}
                    onChange={(event) => void handleConnectionModeChange(event.target.value as ConnectionMode)}
                  >
                    <option value="wsl">WSL</option>
                    <option value="direct">Direct</option>
                    <option value="remote">{t('remoteServer')}</option>
                  </select>
                </Field>
                <Field label={t('refresh')}>
                  <select className="input" value={refreshIntervalMs} onChange={(event) => setRefreshIntervalMs(Number(event.target.value) as RefreshIntervalMs)}>
                    <option value={10000}>10s</option>
                    <option value={30000}>30s</option>
                    <option value={60000}>60s</option>
                  </select>
                </Field>
                <Field label={t('language')}>
                  <select className="input" value={language} onChange={(event) => handleLanguageChange(event.target.value as Language)}>
                    <option value="system">{t('system')}</option>
                    <option value="zh">{t('chinese')}</option>
                    <option value="ja">{t('japanese')}</option>
                    <option value="en">{t('english')}</option>
                  </select>
                </Field>
              </SettingsGroup>

              <SettingsGroup title={t('appearance')}>
                <Field label={t('theme')}>
                  <select className="input" value={themeMode} onChange={(event) => handleThemeChange(event.target.value as ThemeMode)}>
                    <option value="dark">{t('dark')}</option>
                    <option value="light">{t('light')}</option>
                  </select>
                </Field>
                <Field label={t('closeBehavior')}>
                  <select className="input" value={closeBehavior ?? 'ask'} onChange={(event) => setCloseBehavior(event.target.value === 'ask' ? null : event.target.value as CloseBehavior)}>
                    <option value="ask">{t('askEveryTime')}</option>
                    <option value="minimize">{t('minimizeToTray')}</option>
                    <option value="exit">{t('exitApp')}</option>
                  </select>
                </Field>
              </SettingsGroup>

              <SettingsGroup title={t('startup')}>
                <label className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <span className="flex items-center gap-2 text-sm text-zinc-200">
                    <Power size={16} className="text-cyan-400" />
                    {t('autoStart')}
                  </span>
                  <button
                    type="button"
                    className={autoStartEnabled ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
                    disabled={loadingAutoStart}
                    onClick={() => handleAutoStartChange(!autoStartEnabled)}
                  >
                    {loadingAutoStart ? <Loader2 size={14} className="animate-spin" /> : autoStartEnabled ? <Check size={14} /> : t('confirm')}
                  </button>
                </label>
              </SettingsGroup>
            </div>
          )}

          {section === 'remote' && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-200">{t('remoteServers')}</h3>
                  <button type="button" className="btn-secondary btn-xs" onClick={() => setDraft(emptyProfile())}>
                    <Plus size={14} />
                    {t('addRemote')}
                  </button>
                </div>
                <div className="space-y-2">
                  {remoteConfig.profiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        draft.id === profile.id
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                      }`}
                      onClick={() => setDraft(profile)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-zinc-200">{profile.name || profile.host}</span>
                        {selectedProfile?.id === profile.id && <Check size={14} className="text-green-400" />}
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-zinc-500">{profile.username}@{profile.host}:{profile.port}</div>
                    </button>
                  ))}
                  {remoteConfig.profiles.length === 0 && (
                    <div className="rounded-lg border border-dashed border-zinc-800 p-5 text-center text-sm text-zinc-500">
                      {t('noRemoteServers')}
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-4">
                <SettingsGroup title={t('remoteServer')}>
                  <Field label={t('remoteName')}>
                    <input className="input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px]">
                    <Field label={t('host')}>
                      <input className="input" value={draft.host} onChange={(event) => setDraft({ ...draft, host: event.target.value })} />
                    </Field>
                    <Field label={t('port')}>
                      <input className="input" type="number" value={draft.port} onChange={(event) => setDraft({ ...draft, port: Number(event.target.value) || 22 })} />
                    </Field>
                  </div>
                  <Field label={t('username')}>
                    <input className="input" value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} />
                  </Field>
                  <Field label={t('authType')}>
                    <select className="input" value={draft.authType} onChange={(event) => setDraft({ ...draft, authType: event.target.value as RemoteProfile['authType'] })}>
                      <option value="privateKey">{t('privateKey')}</option>
                      <option value="password">{t('password')}</option>
                    </select>
                  </Field>
                  {draft.authType === 'password' ? (
                    <Field label={t('password')}>
                      <input className="input" type="password" value={draft.password ?? ''} onChange={(event) => setDraft({ ...draft, password: event.target.value })} />
                    </Field>
                  ) : (
                    <>
                      <Field label={t('privateKeyPath')}>
                        <input className="input" value={draft.privateKeyPath ?? ''} onChange={(event) => setDraft({ ...draft, privateKeyPath: event.target.value })} />
                      </Field>
                      <Field label={t('passphrase')}>
                        <input className="input" type="password" value={draft.passphrase ?? ''} onChange={(event) => setDraft({ ...draft, passphrase: event.target.value })} />
                      </Field>
                    </>
                  )}
                  <Field label={t('dockerSocket')}>
                    <input className="input" value={draft.dockerSocket ?? '/var/run/docker.sock'} onChange={(event) => setDraft({ ...draft, dockerSocket: event.target.value })} />
                  </Field>
                </SettingsGroup>

                <div className="flex flex-wrap justify-end gap-2">
                  {remoteConfig.profiles.some((profile) => profile.id === draft.id) && (
                    <>
                      <button type="button" className="btn-secondary text-xs" disabled={loadingRemote} onClick={() => selectRemote(draft.id)}>
                        <Check size={14} className="mr-1" />
                        {t('selectRemote')}
                      </button>
                      <button type="button" className="btn-danger text-xs" disabled={loadingRemote} onClick={() => deleteRemote(draft.id)}>
                        <Trash2 size={14} className="mr-1" />
                        {t('deleteRemote')}
                      </button>
                    </>
                  )}
                  <button type="button" className="btn-secondary text-xs" disabled={loadingRemote} onClick={testRemote}>
                    {loadingRemote ? <Loader2 size={14} className="mr-1 animate-spin" /> : <KeyRound size={14} className="mr-1" />}
                    {t('testConnection')}
                  </button>
                  <button type="button" className="btn-primary text-xs" disabled={loadingRemote} onClick={saveRemote}>
                    {loadingRemote ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
                    {t('saveRemote')}
                  </button>
                </div>
              </section>
            </div>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}

function normalizeProfile(profile: RemoteProfile): RemoteProfile {
  return {
    ...profile,
    name: profile.name.trim() || profile.host.trim(),
    host: profile.host.trim(),
    username: profile.username.trim(),
    port: profile.port || 22,
    password: profile.authType === 'password' ? profile.password || '' : null,
    privateKeyPath: profile.authType === 'privateKey' ? profile.privateKeyPath || '' : null,
    passphrase: profile.authType === 'privateKey' ? profile.passphrase || '' : null,
    dockerSocket: profile.dockerSocket?.trim() || '/var/run/docker.sock',
  };
}

function SettingsNavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
        active
          ? 'border-indigo-500/30 bg-indigo-600/15 text-indigo-300'
          : 'border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-4 shadow-sm shadow-black/20">
      <h3 className="mb-4 border-b border-zinc-800 pb-2 text-sm font-semibold text-zinc-200">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
