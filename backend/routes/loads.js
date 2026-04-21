const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/database');
const { auth, adminOnly, approvedCarrierOnly } = require('../middleware/auth');
const { sendEmail, sendSMS } = require('../services/notifications');

function generateLoadNumber() {
  return `FE-${Date.now().toString(36).toUpperCase()}`;
}

// GET /api/loads
router.get('/', auth, approvedCarrierOnly, (req, res) => {
  const db = getDB();
  const { equipment_type, pickup_state, delivery_state, date_from, status } = req.query;

  let query = 'SELECT l.*, c.company_name as booked_carrier_name FROM loads l LEFT JOIN carriers c ON l.booked_carrier_id = c.id WHERE 1=1';
  const params = [];

  if (req.user.role === 'carrier') {
    query += ' AND l.status = "Available"';
  } else if (status) {
    query += ' AND l.status = ?';
    params.push(status);
  }

  if (equipment_type) { query += ' AND l.equipment_type = ?'; params.push(equipment_type); }
  if (pickup_state) { query += ' AND l.pickup_state = ?'; params.push(pickup_state); }
  if (delivery_state) { query += ' AND l.delivery_state = ?'; params.push(delivery_state); }
  if (date_from) { query += ' AND l.pickup_date >= ?'; params.push(date_from); }

  query += ' ORDER BY l.created_at DESC';

  res.json(db.prepare(query).all(...params));
});

// GET /api/loads/:id
router.get('/:id', auth, approvedCarrierOnly, (req, res) => {
  const load = getDB().prepare('SELECT * FROM loads WHERE id = ?').get(req.params.id);
  if (!load) return res.status(404).json({ error: 'Load not found' });
  res.json(load);
});

// POST /api/loads  — admin only
router.post('/', auth, adminOnly, (req, res) => {
  const {
    pickup_location, pickup_state, delivery_location, delivery_state,
    rate, equipment_type, weight, commodity, pickup_date, delivery_date,
    pickup_time, special_instructions,
  } = req.body;

  if (!pickup_location || !delivery_location || !rate || !equipment_type || !pickup_date || !delivery_date)
    return res.status(400).json({ error: 'Required fields missing' });

  const db = getDB();
  const result = db.prepare(`
    INSERT INTO loads (load_number, pickup_location, pickup_state, delivery_location, delivery_state,
      rate, equipment_type, weight, commodity, pickup_date, delivery_date, pickup_time,
      special_instructions, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(generateLoadNumber(), pickup_location, pickup_state, delivery_location, delivery_state,
    rate, equipment_type, weight || '', commodity || '', pickup_date, delivery_date,
    pickup_time || '', special_instructions || '', req.user.id);

  const load = db.prepare('SELECT * FROM loads WHERE id = ?').get(result.lastInsertRowid);

  // Notify matching approved carriers
  notifyMatchingCarriers(db, load).catch(console.error);

  res.status(201).json(load);
});

async function notifyMatchingCarriers(db, load) {
  const carriers = db.prepare(`
    SELECT * FROM carriers WHERE status = 'Approved' AND equipment_types LIKE ?
  `).all(`%${load.equipment_type}%`);

  for (const carrier of carriers) {
    const msg = `New load available! ${load.pickup_state} → ${load.delivery_state} | ${load.equipment_type} | $${load.rate} | Pickup: ${load.pickup_date}. Login to FreightEmpire to book.`;
    await sendEmail(carrier.contact_email, 'New Load Available - FreightEmpire', msg).catch(() => {});
    await sendSMS(carrier.contact_phone, msg).catch(() => {});
  }
}

// PUT /api/loads/:id  — admin only
router.put('/:id', auth, adminOnly, (req, res) => {
  const db = getDB();
  const load = db.prepare('SELECT * FROM loads WHERE id = ?').get(req.params.id);
  if (!load) return res.status(404).json({ error: 'Load not found' });

  const {
    pickup_location, pickup_state, delivery_location, delivery_state,
    rate, equipment_type, weight, commodity, pickup_date, delivery_date,
    pickup_time, special_instructions, status,
  } = req.body;

  db.prepare(`UPDATE loads SET pickup_location=?, pickup_state=?, delivery_location=?, delivery_state=?,
    rate=?, equipment_type=?, weight=?, commodity=?, pickup_date=?, delivery_date=?, pickup_time=?,
    special_instructions=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(pickup_location, pickup_state, delivery_location, delivery_state, rate, equipment_type,
      weight, commodity, pickup_date, delivery_date, pickup_time, special_instructions, status, req.params.id);

  res.json(db.prepare('SELECT * FROM loads WHERE id = ?').get(req.params.id));
});

// DELETE /api/loads/:id  — admin only
router.delete('/:id', auth, adminOnly, (req, res) => {
  getDB().prepare('DELETE FROM loads WHERE id = ?').run(req.params.id);
  res.json({ message: 'Load deleted' });
});

module.exports = router;
