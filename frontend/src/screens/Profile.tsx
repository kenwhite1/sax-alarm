import { api } from '../lib/api';
import { haptic } from '../lib/telegram';

export function Profile({ me, refresh }: { me: any; refresh: () => void }) {
  const u = me?.user;
  const freezes = me?.inventory?.find((i: any) => i.item_code === 'streak_freeze')?.qty ?? 0;

  async function useFreeze() {
    try { await api.streakFreeze(); haptic('success'); refresh(); }
    catch { haptic('error'); }
  }

  return (
    <div className="screen fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {u?.photo_url ? <img className="avatar" style={{ width: 64, height: 64 }} src={u.photo_url} /> : <div className="avatar" style={{ width: 64, height: 64 }} />}
        <div>
          <h1>{u?.first_name} {u?.is_premium && '🎷'}</h1>
          <p className="dim">@{u?.username ?? '—'}</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Статистика</h2>
        <p>Всего дринков: <span className="num">{me?.stats?.total ?? 0}</span></p>
        <p>Проверено CV: <span className="num">{me?.stats?.verified ?? 0}</span></p>
        <p>За неделю: <span className="num">{me?.stats?.week ?? 0}</span></p>
        <p>🔥 Стрик: <span className="num">{u?.streak_days ?? 0}</span> дн.
          {freezes > 0 && (
            <button className="btn secondary" style={{ width: 'auto', padding: '4px 10px', marginLeft: 8, fontSize: 12 }} onClick={useFreeze}>
              🧊 Заморозить ({freezes})
            </button>
          )}
        </p>
      </div>

      <div className="card">
        <h2>Бейджи</h2>
        {(me?.badges ?? []).length === 0 && <p className="dim">Пока пусто. Пей — и придут.</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(me?.badges ?? []).map((b: any) => (
            <span key={b.code} className="badge unverified" title={b.title}>{b.emoji} {b.title}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
