/** Обёртка над Telegram WebApp SDK (telegram-web-app.js подключён в index.html). */

export interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; username?: string; photo_url?: string }; start_param?: string };
  ready(): void;
  expand(): void;
  close(): void;
  openInvoice(url: string, cb?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void): void;
  openTelegramLink(url: string): void;
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
  colorScheme: 'light' | 'dark';
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
}

declare global {
  interface Window { Telegram?: { WebApp: TgWebApp } }
}

export const tg: TgWebApp | undefined = window.Telegram?.WebApp;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#12101a');
  tg.setBackgroundColor('#12101a');
}

export const initData = () => tg?.initData ?? '';

export function haptic(kind: 'tap' | 'success' | 'error') {
  if (!tg) return;
  if (kind === 'tap') tg.HapticFeedback.impactOccurred('light');
  else tg.HapticFeedback.notificationOccurred(kind);
}

/** ?alarm=<id> из пуша (web_app button url) или start_param. */
export function alarmIdFromLaunch(): number | null {
  const p = new URLSearchParams(location.search).get('alarm');
  if (p) return Number(p);
  const sp = tg?.initDataUnsafe.start_param;
  if (sp?.startsWith('alarm_')) return Number(sp.slice(6));
  return null;
}
