const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db/database');
const { auth } = require('../middleware/auth');

function signToken(user, carrier) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      carrierId: carrier?.id,
      carrierStatus: carrier?.status,
    },
    process.env.JWT_SECRET || 'dev_secret',
    { expiresIn: '7d' }
  );
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });

  const carrier = user.carrier_id
    ? db.prepare('SELECT * FROM carriers WHERE id = ?').get(user.carrier_id)
    : null;

  res.json({ token: signToken(user, carrier), role: user.role, carrier });
});

// POST /api/auth/register  (carrier self-onboarding — creates pending record)
router.post('/register', (req, res) => {
  const {
    email, password, company_name, mc_number, dot_number,
    contact_name, contact_phone, equipment_types, preferred_lanes,
    factoring_company, factoring_contact,
  } = req.body;

  if (!email || !password || !company_name || !mc_number || !dot_number)
    return res.status(400).json({ error: 'Required fields missing' });

  const db = getDB();

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim()))
    return res.status(409).json({ error: 'Email already registered' });

  if (db.prepare('SELECT id FROM carriers WHERE mc_number = ?').get(mc_number))
    return res.status(409).json({ error: 'MC number already registered' });

  const hash = bcrypt.hashSync(password, 10);

  const carrierResult = db.prepare(`
    INSERT INTO carriers (company_name, mc_number, dot_number, contact_name, contact_email,
      contact_phone, equipment_types, preferred_lanes, factoring_company, factoring_contact)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    company_name, mc_number, dot_number, contact_name,
    email.toLowerCase().trim(), contact_phone,
    JSON.stringify(Array.isArray(equipment_types) ? equipment_types : [equipment_types]),
    preferred_lanes || '',
    factoring_company || '', factoring_contact || ''
  );

  const carrierId = carrierResult.lastInsertRowid;

  db.prepare('INSERT INTO users (email, password_hash, role, carrier_id) VALUES (?, ?, ?, ?)')
    .run(email.toLowerCase().trim(), hash, 'carrier', carrierId);

  res.status(201).json({ message: 'Application submitted. Await admin approval.' });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  const db = getDB();
  const user = db.prepare('SELECT id, email, role, carrier_id FROM users WHERE id = ?').get(req.user.id);
  const carrier = user.carrier_id
    ? db.prepare('SELECT * FROM carriers WHERE id = ?').get(user.carrier_id)
    : null;
  res.json({ user, carrier });
});

module.exports = router;
