import { t, useLang, getLang } from '../lib/i18n';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AdSlot } from '../components/AdSlot';

const PERIODS = [['day', 'День'], ['week', 'Неделя'], ['all', 'Всё время']] as const;

export function Leaderboard({ meId, squads }: { meId: number; squads: any[] }) {
  useLang();
  const [period, setPeriod] = useState<'day' | 'week' | 'all'>('day');
  const [scope, setScope] = useState<string>('global');
  const [data, setData] = useState<{ rows: any[]; me?: any }>({ rows: [] });

  useEffect(() => {
    api.leaderboard(scope, period).then(setData).catch(() => setData({ rows: [] }));
  }, [scope, period]);

  return (
    <div className="screen fade-in">
      <h1>{t("Самые пьющие 🏆")}</h1>

      <div className="seg" style={{ marginTop: 16 }}>
        <button className={scope === 'global' ? 'active' : ''} onClick={() => setScope('global')}>{t("Мир")}</button>
        {squads.map(s => (
          <button key={s.id} className={scope === `squad:${s.id}` ? 'active' : ''} onClick={() => setScope(`squad:${s.id}`)}>
            {s.name}
          </button>
        ))}
      </div>
      <div className="seg">
        {PERIODS.map(([k, label]) => (
          <button key={k} className={period === k ? 'active' : ''} onClick={() => setPeriod(k)}>{t(label)}</button>
        ))}
      </div>

      {data.rows.length === 0 && <p className="dim">{t("Пока тишина. Первый дринк — твой шанс на топ-1.")}</p>}

      {data.rows.map(r => (
        <div key={r.userId} className={`lb-row ${r.userId === meId ? 'me' : ''}`}>
          <span className={`lb-rank ${r.rank <= 3 ? 'top' : ''}`}>{['🥇', '🥈', '🥉'][r.rank - 1] ?? r.rank}</span>
          {r.photo_url ? <img className="avatar" src={r.photo_url} /> : <div className="avatar" />}
          <span style={{ flex: 1 }}>
            {r.first_name || r.username || `id${r.userId}`} {r.is_premium && '🎷'}
          </span>
          <span className="num">{r.drinks}</span>
        </div>
      ))}

      {data.me && data.me.rank > 50 && (
        <div className="lb-row me">
          <span className="lb-rank">{data.me.rank}</span>
          <span style={{ flex: 1 }}>{t("Ты")}</span>
          <span className="num">{data.me.drinks}</span>
        </div>
      )}

      <AdSlot placement="leaderboard" />
    </div>
  );
}
