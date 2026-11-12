import { useEffect, useState, type FormEvent } from 'react';
import type { ApiConfig, LoginResponse } from '../types';
import { Icon } from './Icon';
import { formatExpiry } from '../utils';

type SettingsProps = {
  config: ApiConfig;
  account: LoginResponse | null;
  connectionError: string | null;
  onSave: (config: ApiConfig) => void;
  onClose: () => void;
};

export function Settings({ config, account, connectionError, onSave, onClose }: SettingsProps) {
  const [url, setUrl] = useState(config.url);
  const [username, setUsername] = useState(config.username);
  const [password, setPassword] = useState(config.password);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl || !username.trim() || !password.trim()) {
      setFormError('Server, username and password are all required.');
      return;
    }
    onSave({ url: trimmedUrl, username: username.trim(), password });
  };

  const info = account?.user_info;

  return (
    <div className="overlay modal" role="dialog" aria-modal="true" aria-label="Account settings">
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-head">
          <h2>Provider settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            <Icon name="close" />
          </button>
        </div>

        <div className="field">
          <label htmlFor="server">Server URL</label>
          <input
            id="server"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="http://your-provider.example:80"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {formError && <p className="form-error">{formError}</p>}
        {connectionError && <p className="form-error">{connectionError}</p>}

        {info && (
          <div className="facts">
            <div className="fact">
              <span>Status</span>
              <strong>{info.status || 'Unknown'}</strong>
            </div>
            <div className="fact">
              <span>Expires</span>
              <strong>{formatExpiry(info.exp_date)}</strong>
            </div>
            <div className="fact">
              <span>Connections</span>
              <strong>
                {info.active_cons ?? '0'} / {info.max_connections ?? '—'}
              </strong>
            </div>
            <div className="fact">
              <span>Formats</span>
              <strong>{(info.allowed_output_formats ?? ['m3u8']).join(', ')}</strong>
            </div>
          </div>
        )}

        <p className="hint">
          Credentials stay on this device and are sent only to the provider you enter here. Press Backspace or Escape
          to close.
        </p>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save &amp; connect
          </button>
        </div>
      </form>
    </div>
  );
}
