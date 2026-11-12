import type { ReactNode } from 'react';

type StatePanelProps = {
  title: string;
  message?: string;
  tone?: 'loading' | 'empty' | 'error';
  action?: ReactNode;
};

export function StatePanel({ title, message, tone = 'loading', action }: StatePanelProps) {
  return (
    <div className={cxState(tone)}>
      {tone === 'loading' && <span className="spinner" aria-hidden="true" />}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

function cxState(tone: string) {
  return `state-panel state-${tone}`;
}
