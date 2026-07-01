import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AdSlot } from '../components/AdSlot';

export function Home({ me, refresh }: { me: any; refresh: () => void }) {
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState<number>(me?.user?.active_from ?? 12);
  const [to, setTo] = useState<number>(me?.user?.active_to ?? 22);

  useEffect(() => {
    setFrom(me?.user?.active_from ?? 12);
    setTo(me?.user?.active_to ?? 22);
  }, [me]);

  async function save() {
    setSaving(true);
    await api.saveSettings({ activeFrom: from, activeTo: to, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    setSaving(false);
    refresh();
  }

  return (
    <div className="screen fade-in">
      <h1>Sax Alarm 🎷</h1>
      <p className="dim" style={{ marginBottom: 16 }}>
        Будильник сработает внезапно. Отключить его можно только дринком.
      </p>

      <div className="card">
        <h2>Сегодня</h2>
        <p><span className="num" style={{ fontSize: 40 }}>{me?.stats?.today ?? 0}</span> <span className="dim">дринков</span></p>
        <p className="dim">🔥 стрик: {me?.user?.streak_days ?? 0} дн. · за неделю: {me?.stats?.week ?? 0}</p>
      </div>

      <div className="card">
        <h2>Окно будильников</h2>
        <p className="dim">Ночью не будим. Случайные срабатывания только в этом окне.</p>
        <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
          <label style={{ flex: 1 }}>
            с <input type="number" min={0} max={23} value={from} onChange={e => setFrom(+e.target.value)}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--ink-line)', background: 'var(--ink)', color: 'var(--cream)' }} />
          </label>
          <label style={{ flex: 1 }}>
            до <input type="number" min={0} max={23} value={to} onChange={e => setTo(+e.target.value)}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--ink-line)', background: 'var(--ink)', color: 'var(--cream)' }} />
          </label>
        </div>
        <button className="btn secondary" onClick={save} disabled={saving}>{saving ? '…' : 'Сохранить'}</button>
      </div>

      <AdSlot placement="feed" />

      <p className="dim" style={{ marginTop: 24, fontSize: 12 }}>
        Дринк — это любой напиток: вода, кофе, компот тоже считаются. Пей ответственно. 18+
      </p>
    </div>
  );
}
