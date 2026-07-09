import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAppStore } from './store';
import { useDocker } from './hooks/useDocker';
import Sidebar from './components/Layout/Sidebar';
import BackToTopButton from './components/Layout/BackToTopButton';
import ConfirmDialog from './components/Layout/ConfirmDialog';
import CloseBehaviorDialog from './components/Layout/CloseBehaviorDialog';
import GlobalLoadingOverlay from './components/Layout/GlobalLoadingOverlay';
import SettingsDialog from './components/Layout/SettingsDialog';
import ToastViewport from './components/Layout/ToastViewport';
import Dashboard from './components/Dashboard/Dashboard';
import ContainerList from './components/Containers/ContainerList';
import ContainerLogs from './components/Containers/ContainerLogs';
import ContainerTerminal from './components/Containers/ContainerTerminal';
import ImageList from './components/Images/ImageList';
import NetworkGraph from './components/Networks/NetworkGraph';
import VolumeList from './components/Volumes/VolumeList';
import { CloseBehavior } from './types';

export default function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const logContainerId = useAppStore((s) => s.logContainerId);
  const terminalContainerId = useAppStore((s) => s.terminalContainerId);
  const themeMode = useAppStore((s) => s.themeMode);
  const closeBehavior = useAppStore((s) => s.closeBehavior);
  const setCloseBehavior = useAppStore((s) => s.setCloseBehavior);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const mainRef = useRef<HTMLElement | null>(null);
  const allowCloseRef = useRef(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const {
    refreshContainers,
    refreshDockerStatus,
    refreshImages,
    refreshNetworks,
    refreshResourceStats,
    refreshVolumes,
    startPolling,
    stopPolling,
  } = useDocker();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', themeMode === 'light');
    document.documentElement.classList.toggle('theme-dark', themeMode === 'dark');
  }, [themeMode]);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    const unlisteners: Array<() => void> = [];
    listen('open-settings', () => setSettingsOpen(true)).then((unlisten) => unlisteners.push(unlisten));
    listen('refresh-data', () => {
      refreshDockerStatus();
      refreshResourceStats();
      refreshContainers(true);
      refreshImages();
      refreshNetworks();
      refreshVolumes();
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [
    refreshContainers,
    refreshDockerStatus,
    refreshImages,
    refreshNetworks,
    refreshResourceStats,
    refreshVolumes,
    setSettingsOpen,
  ]);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    appWindow.onCloseRequested(async (event) => {
      if (allowCloseRef.current) return;

      event.preventDefault();

      if (closeBehavior === 'exit') {
        await invoke('exit_app');
        return;
      }

      if (closeBehavior === 'minimize') {
        await minimizeToTray(appWindow);
        return;
      }

      setCloseDialogOpen(true);
    }).then((handler) => {
      unlisten = handler;
    });

    return () => unlisten?.();
  }, [closeBehavior]);

  const handleCloseChoice = useCallback(async (behavior: CloseBehavior, remember: boolean) => {
    const appWindow = getCurrentWindow();
    if (remember) setCloseBehavior(behavior);
    setCloseDialogOpen(false);

    if (behavior === 'minimize') {
      await minimizeToTray(appWindow);
      return;
    }

    allowCloseRef.current = true;
    await invoke('exit_app');
  }, [setCloseBehavior]);

  const overlays = (
    <>
      <ConfirmDialog />
      <CloseBehaviorDialog
        open={closeDialogOpen}
        onCancel={() => setCloseDialogOpen(false)}
        onChoose={handleCloseChoice}
      />
      <SettingsDialog />
      <GlobalLoadingOverlay />
      <ToastViewport />
    </>
  );

  if (logContainerId) {
    return (
      <>
        <ContainerLogs />
        {overlays}
      </>
    );
  }

  if (terminalContainerId) {
    return (
      <>
        <ContainerTerminal />
        {overlays}
      </>
    );
  }

  return (
    <div className="flex w-full h-full">
      <Sidebar />
      <main ref={mainRef} className="flex-1 overflow-auto p-6">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'containers' && <ContainerList />}
        {activeTab === 'images' && <ImageList />}
        {activeTab === 'networks' && <NetworkGraph />}
        {activeTab === 'volumes' && <VolumeList />}
        <BackToTopButton containerRef={mainRef} />
      </main>
      {overlays}
    </div>
  );
}

async function minimizeToTray(appWindow: ReturnType<typeof getCurrentWindow>) {
  try {
    await appWindow.hide();
    if (await appWindow.isVisible()) {
      await appWindow.minimize();
    }
  } catch (error) {
    console.error('Failed to hide window, minimizing instead', error);
    await appWindow.minimize();
  }
}
