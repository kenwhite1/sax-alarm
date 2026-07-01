import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { AdSlot } from '../components/AdSlot';

export function Squad({ squads, boost, refresh }: { squads: any[]; boost: number; refresh: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [feed, setFeed] = useState<any[]>([]);
  const active = squads[0];

  useEffect(() => {
    if (active) api.reportFeed(active.id).then(setFeed).catch(() => {});
  }, [active?.id]);

  async function create() {
    if (!name.trim()) return;
    await api.createSquad(name.trim());
    haptic('success'); setName(''); refresh();
  }
  async function join() {
    if (!code.trim()) return;
    try { await api.joinSquad(code.trim()); haptic('success'); setCode(''); refresh(); }
    catch { haptic('error'); }
  }
  async function report(drinkId: number) {
    await api.report(drinkId).catch(() => {});
    haptic('tap');
    if (active) api.reportFeed(active.id).then(setFeed).catch(() => {});
  }

  const input = { width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--ink-line)', background: 'var(--ink)', color: 'var(--cream)', marginBottom: 8 } as const;

  return (
    <div className="screen fade-in">
      <h1>Сквад 🍻</h1>

      {boost > 1 && (
        <div className="card" style={{ borderColor: 'var(--brass)' }}>
          <h2>🔥 Буст ×{boost.toFixed(2)}</h2>
          <p className="dim">Друзья онлайн — будильники срабатывают чаще. Пора пить вместе!</p>
        </div>
      )}

      {squads.map(s => (
        <div key={s.id} className="card">
          <h2>{s.name}</h2>
          <p className="dim">{s.members} / {s.max_size} участников</p>
          <p className="num" style={{ margin: '8px 0' }}>Инвайт-код: {s.invite_code}</p>
        </div>
      ))}

      {squads.length === 0 && (
        <>
          <div className="card">
            <h2>Создать сквад</h2>
            <input style={input} placeholder="Название" value={name} onChange={e => setName(e.target.value)} maxLength={40} />
            <button className="btn" onClick={create}>Создать</button>
          </div>
          <div className="card">
            <h2>Вступить по коду</h2>
            <input style={input} placeholder="Инвайт-код" value={code} onChange={e => setCode(e.target.value)} />
            <button className="btn secondary" onClick={join}>Вступить</button>
          </div>
        </>
      )}

      <AdSlot placement="challenge" />

      {active && feed.length > 0 && (
        <>
          <h2 style={{ marginTop: 16 }}>Дринки сквада за 48ч</h2>
          {feed.map(d => (
            <div key={d.id} className="lb-row">
              <span style={{ flex: 1 }}>
                {d.first_name || d.username}
                {' '}<span className={`badge ${d.status}`}>{d.status === 'verified' ? '✔' : d.status === 'unverified' ? '~' : '⚑'}</span>
              </span>
              <span className="dim">{new Date(d.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
              {d.status !== 'flagged' && (
                <button className="btn secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }} onClick={() => report(d.id)}>
                  Оспорить{Number(d.report_count) > 0 ? ` (${d.report_count})` : ''}
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
