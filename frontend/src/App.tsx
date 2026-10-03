import { t, useLang, getLang } from './lib/i18n';
import { useCallback, useEffect, useState } from 'react';
import { initTelegram, alarmIdFromLaunch, tg } from './lib/telegram';
import { api } from './lib/api';
import { Alarm } from './screens/Alarm';
import { Home } from './screens/Home';
import { Leaderboard } from './screens/Leaderboard';
import { Squad } from './screens/Squad';
import { Shop } from './screens/Shop';
import { Profile } from './screens/Profile';

type Tab = 'home' | 'leaderboard' | 'squad' | 'shop' | 'profile';

const TABS: [Tab, string, string][] = [
  ['home', '🎷', 'Главная'],
  ['leaderboard', '🏆', 'Топ'],
  ['squad', '🍻', 'Сквад'],
  ['shop', '⭐', 'Магазин'],
  ['profile', '👤', 'Профиль'],
];

export default function App() {
  useLang();
  const [tab, setTab] = useState<Tab>('home');
  const [me, setMe] = useState<any>(null);
  const [squadData, setSquadData] = useState<{ squads: any[]; currentBoost: number }>({ squads: [], currentBoost: 1 });
  const [alarm, setAlarm] = useState<{ id: number; boost: number } | null>(null);

  const refresh = useCallback(() => {
    api.me().then(setMe).catch(() => {});
    api.mySquads().then(setSquadData).catch(() => {});
  }, []);

  useEffect(() => {
    initTelegram();
    refresh();

    // Запуск из пуша (?alarm=N) или проверка активного будильника
    const fromPush = alarmIdFromLaunch();
    api.activeAlarm()
      .then(r => {
        if (r.alarm && (fromPush === null || fromPush === r.alarm.id)) {
          setAlarm({ id: r.alarm.id, boost: Number(r.alarm.squad_boost) || 1 });
        }
      })
      .catch(() => {});

    // Пока приложение открыто — опрашиваем активный будильник (свернули/развернули)
    const t = setInterval(() => {
      api.activeAlarm().then(r => {
        if (r.alarm) setAlarm(a => a ?? { id: r.alarm!.id, boost: Number(r.alarm!.squad_boost) || 1 });
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!tg) {
    return (
      <div className="screen" style={{ paddingTop: 64, textAlign: 'center' }}>
        <div style={{ fontSize: 64 }}>🎷</div>
        <h1>Sax Alarm</h1>
        <p className="dim">{t("Открой это приложение внутри Telegram.")}</p>
      </div>
    );
  }

  if (alarm) {
    return <Alarm alarmId={alarm.id} boost={alarm.boost} onDone={() => { setAlarm(null); refresh(); }} />;
  }

  return (
    <div className="app">
      {tab === 'home' && <Home me={me} refresh={refresh} />}
      {tab === 'leaderboard' && <Leaderboard meId={me?.user?.id ?? 0} squads={squadData.squads} />}
      {tab === 'squad' && <Squad squads={squadData.squads} boost={squadData.currentBoost} refresh={refresh} />}
      {tab === 'shop' && <Shop me={me} refresh={refresh} />}
      {tab === 'profile' && <Profile me={me} refresh={refresh} />}

      <nav className="tabbar">
        {TABS.map(([key, ico, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            <span className="ico">{ico}</span>{t(label)}
          </button>
        ))}
      </nav>
    </div>
  );
}
