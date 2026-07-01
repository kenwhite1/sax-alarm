import { initData } from './telegram';

const BASE = '/api';

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'X-Tg-Init-Data': initData(),
      ...(opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...opts.headers,
    },
  });
  if (!res.ok) throw Object.assign(new Error('api'), { status: res.status, body: await res.json().catch(() => ({})) });
  return res.json();
}

export const api = {
  me: () => req<any>('/me'),
  saveSettings: (s: object) => req('/me/settings', { method: 'PATCH', body: JSON.stringify(s) }),
  streakFreeze: () => req('/me/streak-freeze', { method: 'POST' }),

  activeAlarm: () => req<{ alarm: { id: number; squad_boost: number } | null }>('/drinks/active-alarm'),
  submitDrink: (fd: FormData) => req<{ id: number; status: string }>('/drinks', { method: 'POST', body: fd }),
  skipAlarm: (alarmId: number) => req('/drinks/skip', { method: 'POST', body: JSON.stringify({ alarmId }) }),

  leaderboard: (scope: string, period: string) =>
    req<{ rows: any[]; me?: any }>(`/leaderboard?scope=${scope}&period=${period}`),

  mySquads: () => req<{ squads: any[]; currentBoost: number }>('/squads/mine'),
  createSquad: (name: string) => req<any>('/squads', { method: 'POST', body: JSON.stringify({ name }) }),
  joinSquad: (code: string) => req<any>('/squads/join', { method: 'POST', body: JSON.stringify({ code }) }),
  squadMembers: (id: number) => req<any[]>(`/squads/${id}/members`),

  products: () => req<any[]>('/shop/products'),
  invoice: (productCode: string) => req<{ link: string }>('/shop/invoice', { method: 'POST', body: JSON.stringify({ productCode }) }),

  adSlot: (placement: string) => req<{ ad: any }>(`/ads/slot?placement=${placement}`),
  adEvent: (id: number, event: string) => req(`/ads/${id}/event`, { method: 'POST', body: JSON.stringify({ event }) }),

  report: (drinkId: number) => req('/reports', { method: 'POST', body: JSON.stringify({ drinkId }) }),
  reportFeed: (squadId: number) => req<any[]>(`/reports/feed/${squadId}`),
};
