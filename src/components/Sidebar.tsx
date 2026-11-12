import type { LoginResponse, Tab } from '../types';
import { Icon, type IconName } from './Icon';
import { cx, formatExpiry } from '../utils';

const NAV: Array<{ tab: Tab; label: string; icon: IconName }> = [
  { tab: 'live', label: 'Live TV', icon: 'live' },
  { tab: 'movies', label: 'Movies', icon: 'movies' },
  { tab: 'series', label: 'Series', icon: 'series' },
];

type SidebarProps = {
  tab: Tab;
  onTab: (tab: Tab) => void;
  onSettings: () => void;
  account: LoginResponse | null;
  error: string | null;
  connecting: boolean;
};

export function Sidebar({ tab, onTab, onSettings, account, error, connecting }: SidebarProps) {
  const info = account?.user_info;
  const label = account?.user_info.username ?? (connecting ? 'Connecting…' : 'Not signed in');
  const caption = account
    ? `Until ${formatExpiry(info?.exp_date)}`
    : connecting
      ? 'Contacting server'
      : 'Add credentials';

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">N</span>
        <span className="brand-text">
          <strong>NOVA TV</strong>
          <small>IPTV Player</small>
        </span>
      </div>

      <nav className="nav" aria-label="Sections">
        {NAV.map((item) => (
          <button
            key={item.tab}
            type="button"
            className={cx('nav-item', tab === item.tab && 'is-active')}
            aria-current={tab === item.tab ? 'page' : undefined}
            onClick={() => onTab(item.tab)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
        <button type="button" className="nav-item" onClick={onSettings}>
          <Icon name="settings" />
          <span>Settings</span>
        </button>
      </nav>

      <div className="sidebar-foot">
        {error ? (
          <div className="account-card is-error">
            <span className="account-dot" />
            <div className="account-meta">
              <strong>Offline</strong>
              <small>Check your account</small>
            </div>
          </div>
        ) : (
          <div className="account-card">
            <span className="account-dot" />
            <div className="account-meta">
              <strong>{label}</strong>
              <small>{caption}</small>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
