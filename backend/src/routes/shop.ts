import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { one, q } from '../db.js';
import { createStarsInvoice } from '../bot.js';

export const shop = Router();

shop.get('/products', async (_req, res) => {
  res.json(await q(`SELECT * FROM products ORDER BY stars_price`));
});

/** Создаёт pending-транзакцию и Stars-инвойс; клиент открывает ссылку через WebApp.openInvoice(). */
shop.post('/invoice', async (req, res) => {
  const userId = req.tgUser!.id;
  const code = String(req.body.productCode ?? '');
  const product = await one(`SELECT * FROM products WHERE code=$1`, [code]);
  if (!product) return res.status(404).json({ error: 'unknown product' });

  const payload = uuid();
  await q(
    `INSERT INTO transactions (user_id, product_code, stars_amount, invoice_payload)
     VALUES ($1,$2,$3,$4)`,
    [userId, code, product.stars_price, payload]
  );
  const link = await createStarsInvoice(code, payload);
  res.json({ link });
});

shop.get('/transactions', async (req, res) => {
  res.json(
    await q(
      `SELECT t.id, t.product_code, t.stars_amount, t.status, t.created_at, p.title
       FROM transactions t JOIN products p ON p.code=t.product_code
       WHERE t.user_id=$1 ORDER BY t.created_at DESC LIMIT 50`,
      [req.tgUser!.id]
    )
  );
});
