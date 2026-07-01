import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { tg, haptic } from '../lib/telegram';

const ICONS: Record<string, string> = {
  premium_month: '🎷', streak_freeze: '🧊', alarm_skip: '🔕',
  boost_day: '🚀', profile_neon: '💜', profile_gold_sax: '🏆',
};

export function Shop({ me, refresh }: { me: any; refresh: () => void }) {
  const [products, setProducts] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { api.products().then(setProducts).catch(() => {}); }, []);

  async function buy(code: string) {
    setBusy(code);
    try {
      const { link } = await api.invoice(code);
      // Telegram Stars: открываем инвойс внутри Telegram
      tg?.openInvoice(link, status => {
        if (status === 'paid') { haptic('success'); refresh(); }
        else if (status === 'failed') haptic('error');
      });
    } finally {
      setBusy(null);
    }
  }

  const premium = products.filter(p => p.kind === 'subscription');
  const items = products.filter(p => p.kind !== 'subscription');

  return (
    <div className="screen fade-in">
      <h1>Магазин ⭐</h1>

      {me?.user?.is_premium && (
        <div className="card" style={{ borderColor: 'var(--brass)' }}>
          <h2>🎷 Premium активен</h2>
          <p className="dim">до {new Date(me.user.premium_until).toLocaleDateString('ru')}</p>
        </div>
      )}

      {!me?.user?.is_premium && premium.map(p => (
        <div key={p.code} className="card" style={{ borderColor: 'var(--brass)' }}>
          <h2>🎷 Sax Premium</h2>
          <p className="dim">
            Без рекламы · кастомные сакс-ремиксы будильника · расширенная статистика ·
            эксклюзивные бейджи · сквад до 25 человек
          </p>
          <button className="btn" style={{ marginTop: 12 }} disabled={busy === p.code} onClick={() => buy(p.code)}>
            {p.stars_price} ⭐ / месяц
          </button>
        </div>
      ))}

      <h2 style={{ marginTop: 16 }}>Предметы</h2>
      {items.map(p => {
        const owned = me?.inventory?.find((i: any) => i.item_code === p.code)?.qty ?? 0;
        return (
          <div key={p.code} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>{ICONS[p.code] ?? '🎁'}</span>
            <div style={{ flex: 1 }}>
              <strong>{p.title}</strong>
              {owned > 0 && <span className="dim"> · есть {owned}</span>}
            </div>
            <button className="btn" style={{ width: 'auto', padding: '8px 14px' }} disabled={busy === p.code} onClick={() => buy(p.code)}>
              {p.stars_price} ⭐
            </button>
          </div>
        );
      })}
    </div>
  );
}
