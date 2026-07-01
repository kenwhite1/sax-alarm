import { Redis } from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl);

// Ключи:
// lb:global:{period}:{key}        ZSET user -> drinks
// lb:squad:{id}:{period}:{key}    ZSET user -> drinks
// drink:last:{userId}             ts последнего засчитанного дринка
// phash:{userId}                  LIST последних hex-хэшей
// boost:{userId}:{date}           множитель лидерборда (покупка boost_day)
