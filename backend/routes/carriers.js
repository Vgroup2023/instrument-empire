const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { getDB } = require('../db/database');
const { auth, adminOnly } = require('../middleware/auth');
const { verifyMCDOT } = require('../services/fmcsa');
const { sendEmail, sendSMS } = require('../services/notifications');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/carriers  — admin: all; carrier: own record
router.get('/', auth, (req, res) => {
  const db = getDB();
  if (req.user.role === 'admin') {
    const carriers = db.prepare('SELECT * FROM carriers ORDER BY created_at DESC').all();
    return res.json(carriers);
  }
  const carrier = db.prepare('SELECT * FROM carriers WHERE id = ?').get(req.user.carrierId);
  res.json(carrier ? [carrier] : []);
});

// GET /api/carriers/:id
router.get('/:id', auth, adminOnly, (req, res) => {
  const carrier = getDB().prepare('SELECT * FROM carriers WHERE id = ?').get(req.params.id);
  if (!carrier) return res.status(404).json({ error: 'Carrier not found' });
  res.json(carrier);
});

// POST /api/carriers/:id/verify-fmcsa  — admin triggers FMCSA check
router.post('/:id/verify-fmcsa', auth, adminOnly, async (req, res) => {
  const db = getDB();
  const carrier = db.prepare('SELECT * FROM carriers WHERE id = ?').get(req.params.id);
  if (!carrier) return res.status(404).json({ error: 'Carrier not found' });

  const fmcsaData = await verifyMCDOT(carrier.mc_number, carrier.dot_number);
  db.prepare('UPDATE carriers SET fmcsa_data = ?, safety_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(fmcsaData), fmcsaData.safetyRating || 'Unknown', req.params.id);

  res.json({ message: 'FMCSA check complete', fmcsaData });
});

// PUT /api/carriers/:id/status  — admin approves/rejects
router.put('/:id/status', auth, adminOnly, (req, res) => {
  const { status, rejection_reason } = req.body;
  if (!['Approved', 'Rejected'].includes(status))
    return res.status(400).json({ error: 'Status must be Approved or Rejected' });

  const db = getDB();
  db.prepare('UPDATE carriers SET status = ?, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, rejection_reason || null, req.params.id);

  const carrier = db.prepare('SELECT * FROM carriers WHERE id = ?').get(req.params.id);

  // Notify carrier
  const msg = status === 'Approved'
    ? `Your carrier application for ${carrier.company_name} has been APPROVED. You can now access the load board.`
    : `Your carrier application was rejected. Reason: ${rejection_reason || 'Not specified'}`;

  sendEmail(carrier.contact_email, `Application ${status} - FreightEmpire`, msg).catch(console.error);
  sendSMS(carrier.contact_phone, msg).catch(console.error);

  res.json({ message: `Carrier ${status}`, carrier });
});

// PUT /api/carriers/:id  — update carrier info
router.put('/:id', auth, (req, res) => {
  const db = getDB();
  const carrier = db.prepare('SELECT * FROM carriers WHERE id = ?').get(req.params.id);
  if (!carrier) return res.status(404).json({ error: 'Carrier not found' });
  if (req.user.role !== 'admin' && req.user.carrierId !== carrier.id)
    return res.status(403).json({ error: 'Forbidden' });

  const { contact_name, contact_phone, equipment_types, preferred_lanes, factoring_company, factoring_contact } = req.body;
  db.prepare(`UPDATE carriers SET contact_name=?, contact_phone=?, equipment_types=?, preferred_lanes=?,
    factoring_company=?, factoring_contact=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(contact_name, contact_phone,
      JSON.stringify(Array.isArray(equipment_types) ? equipment_types : [equipment_types]),
      preferred_lanes, factoring_company, factoring_contact, req.params.id);

  res.json(db.prepare('SELECT * FROM carriers WHERE id = ?').get(req.params.id));
});

// POST /api/carriers/:id/documents — upload COI / W-9
router.post('/:id/documents', auth, upload.fields([{ name: 'insurance_file' }, { name: 'w9_file' }]), (req, res) => {
  const db = getDB();
  const carrier = db.prepare('SELECT * FROM carriers WHERE id = ?').get(req.params.id);
  if (!carrier) return res.status(404).json({ error: 'Carrier not found' });
  if (req.user.role !== 'admin' && req.user.carrierId !== carrier.id)
    return res.status(403).json({ error: 'Forbidden' });

  const updates = {};
  if (req.files?.insurance_file) updates.insurance_file = req.files.insurance_file[0].filename;
  if (req.files?.w9_file) updates.w9_file = req.files.w9_file[0].filename;

  if (Object.keys(updates).length) {
    const sets = Object.keys(updates).map(k => `${k}=?`).join(', ');
    db.prepare(`UPDATE carriers SET ${sets}, insurance_status='Received', updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(...Object.values(updates), req.params.id);
  }

  res.json({ message: 'Documents uploaded', ...updates });
});

// DELETE /api/carriers/:id
router.delete('/:id', auth, adminOnly, (req, res) => {
  getDB().prepare('DELETE FROM carriers WHERE id = ?').run(req.params.id);
  res.json({ message: 'Carrier deleted' });
});

module.exports = router;
