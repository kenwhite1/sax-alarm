import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { one, q } from '../db.js';
import { squadBoostFor } from '../scheduler.js';

export const squads = Router();

squads.post('/', async (req, res) => {
  const userId = req.tgUser!.id;
  const name = String(req.body.name ?? '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'name required' });

  const me = await one(`SELECT is_premium FROM users WHERE id=$1`, [userId]);
  const squad = await one(
    `INSERT INTO squads (name, invite_code, owner_id, max_size)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [name, randomBytes(4).toString('hex'), userId, me?.is_premium ? 25 : 10]
  );
  await q(`INSERT INTO squad_members (squad_id, user_id) VALUES ($1,$2)`, [squad!.id, userId]);
  res.json(squad);
});

squads.post('/join', async (req, res) => {
  const userId = req.tgUser!.id;
  const squad = await one(`SELECT * FROM squads WHERE invite_code=$1`, [String(req.body.code ?? '')]);
  if (!squad) return res.status(404).json({ error: 'squad not found' });

  const size = await one<{ n: string }>(`SELECT count(*) n FROM squad_members WHERE squad_id=$1`, [squad.id]);
  if (Number(size?.n) >= squad.max_size) return res.status(409).json({ error: 'squad full' });

  await q(
    `INSERT INTO squad_members (squad_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [squad.id, userId]
  );
  res.json(squad);
});

squads.post('/leave', async (req, res) => {
  await q(`DELETE FROM squad_members WHERE squad_id=$1 AND user_id=$2`, [Number(req.body.squadId), req.tgUser!.id]);
  res.json({ ok: true });
});

squads.get('/mine', async (req, res) => {
  const userId = req.tgUser!.id;
  const mine = await q(
    `SELECT s.*, (SELECT count(*) FROM squad_members WHERE squad_id=s.id) AS members
     FROM squads s JOIN squad_members sm ON sm.squad_id=s.id WHERE sm.user_id=$1`,
    [userId]
  );
  const boost = await squadBoostFor(userId);
  res.json({ squads: mine, currentBoost: boost });
});

squads.get('/:id/members', async (req, res) => {
  const rows = await q(
    `SELECT u.id, u.username, u.first_name, u.photo_url, u.streak_days, u.is_premium
     FROM squad_members sm JOIN users u ON u.id=sm.user_id
     WHERE sm.squad_id=$1 ORDER BY u.streak_days DESC`,
    [Number(req.params.id)]
  );
  res.json(rows);
});
