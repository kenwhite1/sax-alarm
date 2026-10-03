import { t, useLang, getLang } from '../lib/i18n';
/**
 * Нативный рекламный слот (бары/бренды). Честная пометка «партнёр».
 * Premium не видит рекламы — сервер вернёт ad:null.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { tg } from '../lib/telegram';

export function AdSlot({ placement }: { placement: 'feed' | 'leaderboard' | 'challenge' }) {
  useLang();
  const [ad, setAd] = useState<any>(null);

  useEffect(() => {
    api.adSlot(placement).then(r => setAd(r.ad)).catch(() => {});
  }, [placement]);

  if (!ad) return null;

  async function click() {
    await api.adEvent(ad.id, 'click').catch(() => {});
    if (!ad.cta_url) return;
    // t.me-ссылки открываем внутри Telegram, внешние — в браузере
    if (ad.cta_url.startsWith('https://t.me/') && tg) tg.openTelegramLink(ad.cta_url);
    else window.open(ad.cta_url, '_blank');
  }

  return (
    <div className="card ad-card" onClick={click} style={{ cursor: 'pointer' }}>
      <span className="ad-mark">{t("Партнёр ·")}{ad.advertiser}</span>
      <h2 style={{ marginTop: 4 }}>
        {t(ad.kind === 'drink_of_week' ? '🍹 Напиток недели: ' : ad.kind === 'coupon' ? '🎟 ' : '🏁 ')}
        {ad.title}
      </h2>
      {ad.body && <p className="dim">{ad.body}</p>}
      {ad.coupon_code && (
        <p className="num" style={{ marginTop: 8, color: 'var(--brass)' }}>{t("Промокод:")}{ad.coupon_code}
        </p>
      )}
    </div>
  );
}
