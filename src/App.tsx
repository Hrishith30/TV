import { useCallback, useEffect, useState } from 'react';
import { clearCache, loadConfig, saveConfig, xtream } from './api';
import type { ApiConfig, LoginResponse, PlayItem, Tab } from './types';
import { LiveView } from './components/LiveView';
import { MoviesView } from './components/MoviesView';
import { Player } from './components/Player';
import { SeriesView } from './components/SeriesView';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { useSpatialNav } from './hooks/useSpatialNav';

export default function App() {
  const [config, setConfig] = useState<ApiConfig>(loadConfig);
  const [account, setAccount] = useState<LoginResponse | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [tab, setTab] = useState<Tab>('live');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playback, setPlayback] = useState<{ items: PlayItem[]; index: number } | null>(null);

  const connect = useCallback((next: ApiConfig) => {
    setConnecting(true);
    setConnectionError(null);
    xtream
      .login(next)
      .then((data) => {
        setAccount(data);
        setConnecting(false);
      })
      .catch((error: Error) => {
        setAccount(null);
        setConnectionError(error.message);
        setConnecting(false);
      });
  }, []);

  useEffect(() => {
    connect(config);
  }, [config, connect]);

  useSpatialNav(!playback && !settingsOpen);

  const handleSave = (next: ApiConfig) => {
    clearCache();
    saveConfig(next);
    setConfig(next);
    setSettingsOpen(false);
    setPlayback(null);
  };

  const handlePlay = (items: PlayItem[], index: number) => setPlayback({ items, index });

  return (
    <div className="app">
      <Sidebar
        tab={tab}
        onTab={setTab}
        onSettings={() => setSettingsOpen(true)}
        account={account}
        error={connectionError}
      />

      <main className="main">
        {connecting && !account && (
          <div className="boot">
            <span className="spinner" aria-hidden="true" />
            <h2>Connecting to your provider</h2>
            <p>Signing in and checking your subscription.</p>
          </div>
        )}

        {!connecting && !account && (
          <div className="boot">
            <h2>Could not connect</h2>
            <p>{connectionError ?? 'The provider did not accept this account.'}</p>
            <div className="boot-actions">
              <button type="button" className="btn btn-primary" onClick={() => setSettingsOpen(true)}>
                Check credentials
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => connect(config)}>
                Try again
              </button>
            </div>
          </div>
        )}

        {account && (
          <>
            {tab === 'live' && <LiveView config={config} onPlay={handlePlay} />}
            {tab === 'movies' && <MoviesView config={config} onPlay={handlePlay} />}
            {tab === 'series' && <SeriesView config={config} onPlay={handlePlay} />}
          </>
        )}
      </main>

      {settingsOpen && (
        <Settings
          config={config}
          account={account}
          connectionError={connectionError}
          onSave={handleSave}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {playback && (
        <Player items={playback.items} startIndex={playback.index} onClose={() => setPlayback(null)} />
      )}
    </div>
  );
}
