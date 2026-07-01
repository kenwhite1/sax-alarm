import { Router } from 'express';
import { top, type Period } from '../services/leaderboard.js';

export const leaderboard = Router();

/** GET /api/leaderboard?scope=global|squad:<id>&period=day|week|all */
leaderboard.get('/', async (req, res) => {
  const period = (['day', 'week', 'all'].includes(String(req.query.period)) ? req.query.period : 'day') as Period;
  const scopeRaw = String(req.query.scope ?? 'global');
  const scope = scopeRaw.startsWith('squad:') ? (scopeRaw as `squad:${number}`) : 'global';
  const data = await top(scope, period, 50, req.tgUser!.id);
  res.json(data);
});
