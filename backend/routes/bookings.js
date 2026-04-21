const router = require('express').Router();
const { getDB } = require('../db/database');
const { auth, adminOnly, approvedCarrierOnly } = require('../middleware/auth');
const { sendEmail, sendSMS } = require('../services/notifications');

// GET /api/bookings
router.get('/', auth, (req, res) => {
  const db = getDB();
  const query = `
    SELECT b.*, l.load_number, l.pickup_location, l.pickup_state, l.delivery_location,
      l.delivery_state, l.rate, l.equipment_type, l.pickup_date, l.delivery_date, l.status as load_status,
      c.company_name, c.contact_name, c.contact_phone, c.contact_email, c.mc_number
    FROM bookings b
    JOIN loads l ON b.load_id = l.id
    JOIN carriers c ON b.carrier_id = c.id
    ${req.user.role === 'carrier' ? 'WHERE b.carrier_id = ?' : ''}
    ORDER BY b.created_at DESC
  `;
  const params = req.user.role === 'carrier' ? [req.user.carrierId] : [];
  res.json(db.prepare(query).all(...params));
});

// GET /api/bookings/:id
router.get('/:id', auth, (req, res) => {
  const db = getDB();
  const booking = db.prepare(`
    SELECT b.*, l.load_number, l.pickup_location, l.pickup_state, l.delivery_location,
      l.delivery_state, l.rate, l.equipment_type, l.pickup_date, l.delivery_date,
      c.company_name, c.contact_name, c.mc_number
    FROM bookings b
    JOIN loads l ON b.load_id = l.id
    JOIN carriers c ON b.carrier_id = c.id
    WHERE b.id = ?
  `).get(req.params.id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (req.user.role === 'carrier' && booking.carrier_id !== req.user.carrierId)
    return res.status(403).json({ error: 'Forbidden' });

  res.json(booking);
});

// POST /api/bookings  — carrier requests a load
router.post('/', auth, approvedCarrierOnly, (req, res) => {
  if (req.user.role !== 'carrier') return res.status(403).json({ error: 'Carriers only' });

  const { load_id, driver_name, driver_phone, truck_number, trailer_number, notes } = req.body;
  if (!load_id) return res.status(400).json({ error: 'load_id required' });

  const db = getDB();
  const load = db.prepare('SELECT * FROM loads WHERE id = ?').get(load_id);
  if (!load) return res.status(404).json({ error: 'Load not found' });
  if (load.status !== 'Available') return res.status(409).json({ error: 'Load is no longer available' });

  const existing = db.prepare('SELECT id FROM bookings WHERE load_id = ? AND carrier_id = ? AND status != "Rejected"').get(load_id, req.user.carrierId);
  if (existing) return res.status(409).json({ error: 'You already have a pending booking for this load' });

  const result = db.prepare(`
    INSERT INTO bookings (load_id, carrier_id, driver_name, driver_phone, truck_number, trailer_number, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(load_id, req.user.carrierId, driver_name || '', driver_phone || '', truck_number || '', trailer_number || '', notes || '');

  // Notify admin via email (placeholder)
  const adminUser = db.prepare("SELECT email FROM users WHERE role = 'admin' LIMIT 1").get();
  if (adminUser) {
    const carrier = db.prepare('SELECT * FROM carriers WHERE id = ?').get(req.user.carrierId);
    sendEmail(adminUser.email, 'New Booking Request', `${carrier.company_name} requested load ${load.load_number}`).catch(console.error);
  }

  res.status(201).json(db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/bookings/:id/status  — admin approves/rejects
router.put('/:id/status', auth, adminOnly, (req, res) => {
  const { status, payment_status } = req.body;
  if (!['Approved', 'Rejected', 'Completed'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });

  const db = getDB();
  const booking = db.prepare(`
    SELECT b.*, l.load_number, l.pickup_state, l.delivery_state, l.rate,
      c.contact_email, c.contact_phone, c.company_name
    FROM bookings b JOIN loads l ON b.load_id = l.id JOIN carriers c ON b.carrier_id = c.id
    WHERE b.id = ?
  `).get(req.params.id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  db.prepare('UPDATE bookings SET status=?, payment_status=COALESCE(?, payment_status), updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(status, payment_status || null, req.params.id);

  // Update load status when booking approved
  if (status === 'Approved') {
    db.prepare("UPDATE loads SET status='Booked', booked_carrier_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(booking.carrier_id, booking.load_id);
    // Reject other pending bookings for this load
    db.prepare("UPDATE bookings SET status='Rejected', updated_at=CURRENT_TIMESTAMP WHERE load_id=? AND id != ? AND status='Pending'")
      .run(booking.load_id, booking.id);
  }

  if (status === 'Completed') {
    db.prepare("UPDATE loads SET status='Completed', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(booking.load_id);
  }

  const msg = status === 'Approved'
    ? `Your booking for load ${booking.load_number} (${booking.pickup_state} → ${booking.delivery_state}, $${booking.rate}) has been APPROVED!`
    : `Your booking for load ${booking.load_number} has been ${status}.`;

  sendEmail(booking.contact_email, `Booking ${status} - FreightEmpire`, msg).catch(console.error);
  sendSMS(booking.contact_phone, msg).catch(console.error);

  res.json(db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id));
});

module.exports = router;
