import { useEffect, useRef } from 'react';
import { useAppStore } from './store';
import { useDocker } from './hooks/useDocker';
import Sidebar from './components/Layout/Sidebar';
import BackToTopButton from './components/Layout/BackToTopButton';
import ConfirmDialog from './components/Layout/ConfirmDialog';
import ToastViewport from './components/Layout/ToastViewport';
import Dashboard from './components/Dashboard/Dashboard';
import ContainerList from './components/Containers/ContainerList';
import ContainerLogs from './components/Containers/ContainerLogs';
import ContainerTerminal from './components/Containers/ContainerTerminal';
import ImageList from './components/Images/ImageList';
import NetworkGraph from './components/Networks/NetworkGraph';
import VolumeList from './components/Volumes/VolumeList';

export default function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const logContainerId = useAppStore((s) => s.logContainerId);
  const terminalContainerId = useAppStore((s) => s.terminalContainerId);
  const themeMode = useAppStore((s) => s.themeMode);
  const mainRef = useRef<HTMLElement | null>(null);
  const { startPolling, stopPolling } = useDocker();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', themeMode === 'light');
    document.documentElement.classList.toggle('theme-dark', themeMode === 'dark');
  }, [themeMode]);

  if (logContainerId) {
    return (
      <>
        <ContainerLogs />
        <ConfirmDialog />
        <ToastViewport />
      </>
    );
  }

  if (terminalContainerId) {
    return (
      <>
        <ContainerTerminal />
        <ConfirmDialog />
        <ToastViewport />
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
      <ConfirmDialog />
      <ToastViewport />
    </div>
  );
}
