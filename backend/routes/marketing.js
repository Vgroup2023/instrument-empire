const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const { getDB } = require('../db/database');
const { auth, adminOnly } = require('../middleware/auth');
const { sendEmail, sendSMS } = require('../services/notifications');

// ── Leads ──────────────────────────────────────────────────────────────────

// GET /api/marketing/leads
router.get('/leads', auth, adminOnly, (req, res) => {
  const { status, lead_type } = req.query;
  let query = 'SELECT * FROM leads WHERE 1=1';
  const params = [];
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (lead_type) { query += ' AND lead_type = ?'; params.push(lead_type); }
  query += ' ORDER BY created_at DESC';
  res.json(getDB().prepare(query).all(...params));
});

// POST /api/marketing/leads  — manual entry OR public lead capture
router.post('/leads', (req, res) => {
  const { company_name, contact_name, email, phone, lead_type, source, mc_number, dot_number, equipment_types, preferred_lanes, notes } = req.body;
  if (!company_name || !contact_name || !email)
    return res.status(400).json({ error: 'company_name, contact_name, and email are required' });

  const db = getDB();
  const result = db.prepare(`
    INSERT INTO leads (company_name, contact_name, email, phone, lead_type, source, mc_number, dot_number, equipment_types, preferred_lanes, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    company_name, contact_name, email, phone || '', lead_type || 'Carrier',
    source || 'Website', mc_number || '', dot_number || '',
    equipment_types || '', preferred_lanes || '', notes || ''
  );

  res.status(201).json(db.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/marketing/leads/:id
router.put('/leads/:id', auth, adminOnly, (req, res) => {
  const db = getDB();
  const { status, notes, phone, lead_type, last_contacted_at } = req.body;
  db.prepare(`UPDATE leads SET status=COALESCE(?,status), notes=COALESCE(?,notes), phone=COALESCE(?,phone),
    lead_type=COALESCE(?,lead_type), last_contacted_at=COALESCE(?,last_contacted_at),
    updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(status, notes, phone, lead_type, last_contacted_at, req.params.id);
  res.json(db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id));
});

// DELETE /api/marketing/leads/:id
router.delete('/leads/:id', auth, adminOnly, (req, res) => {
  getDB().prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  res.json({ message: 'Lead deleted' });
});

// ── AI Content Generation ──────────────────────────────────────────────────

// POST /api/marketing/ai/generate
router.post('/ai/generate', auth, adminOnly, async (req, res) => {
  const { type, lead_id, tone, objective, custom_context } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'AI not configured. Add ANTHROPIC_API_KEY to your .env file.',
    });
  }

  const db = getDB();
  const lead = lead_id ? db.prepare('SELECT * FROM leads WHERE id = ?').get(lead_id) : null;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are an elite freight brokerage sales copywriter for FreightEmpire, a U.S. freight brokerage.
Write compelling, conversion-focused content to recruit carriers and acquire shipper customers.
Key value props: competitive spot & contract rates, 24/7 support, fast QuickPay (24-48h), dedicated lanes, nationwide freight.
Be concise, specific, and professional. Avoid generic filler phrases.`;

  let userPrompt;
  if (type === 'Email') {
    userPrompt = `Write a cold outreach email${lead ? ` to ${lead.contact_name} at ${lead.company_name}` : ''}.
${lead?.lead_type ? `Lead type: ${lead.lead_type}` : ''}
${lead?.equipment_types ? `Equipment: ${lead.equipment_types}` : ''}
${lead?.preferred_lanes ? `Preferred lanes: ${lead.preferred_lanes}` : ''}
Tone: ${tone || 'Professional and direct'}
Objective: ${objective || 'Recruit as a partner carrier / generate a call'}
${custom_context || ''}

Format:
Subject: [subject line]

[Email body with greeting, value prop, social proof, clear CTA, and signature block for "FreightEmpire Operations Team"]`;
  } else {
    userPrompt = `Write a short SMS (max 160 characters) to ${lead ? `${lead.contact_name} at ${lead.company_name}` : 'a freight prospect'}.
${lead?.lead_type ? `Lead type: ${lead.lead_type}` : ''}
Objective: ${objective || 'Get them to call or visit our load board'}
${custom_context || ''}
Return ONLY the SMS text, no explanation.`;
  }

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = message.content[0].text;

    // Save campaign
    if (lead_id) {
      db.prepare('INSERT INTO ai_campaigns (name, type, target_lead_id, content) VALUES (?, ?, ?, ?)')
        .run(`${type} to ${lead?.company_name || 'Unknown'}`, type, lead_id, content);
    }

    res.json({ content });
  } catch (err) {
    console.error('AI generation error:', err);
    res.status(500).json({ error: 'AI generation failed. Check your API key and try again.' });
  }
});

// POST /api/marketing/ai/send  — send AI-generated content to a lead
router.post('/ai/send', auth, adminOnly, async (req, res) => {
  const { lead_id, type, content } = req.body;
  if (!lead_id || !content) return res.status(400).json({ error: 'lead_id and content required' });

  const db = getDB();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead_id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  let result;
  if (type === 'Email') {
    const lines = content.split('\n');
    const subjectLine = lines.find(l => l.startsWith('Subject:'))?.replace('Subject:', '').trim() || 'FreightEmpire - Partnership Opportunity';
    const body = lines.filter(l => !l.startsWith('Subject:')).join('\n').trim();
    result = await sendEmail(lead.email, subjectLine, body);
  } else {
    result = await sendSMS(lead.phone, content);
  }

  // Update lead status and last_contacted_at
  db.prepare("UPDATE leads SET status='Contacted', last_contacted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(lead_id);

  res.json({ message: `${type} sent to ${lead.email || lead.phone}`, result });
});

// GET /api/marketing/metrics
router.get('/metrics', auth, adminOnly, (req, res) => {
  const db = getDB();
  const stats = {
    total_leads: db.prepare('SELECT COUNT(*) as c FROM leads').get().c,
    new_leads: db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='New'").get().c,
    contacted: db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='Contacted'").get().c,
    qualified: db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='Qualified'").get().c,
    converted: db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='Converted'").get().c,
    lost: db.prepare("SELECT COUNT(*) as c FROM leads WHERE status='Lost'").get().c,
    carrier_leads: db.prepare("SELECT COUNT(*) as c FROM leads WHERE lead_type='Carrier'").get().c,
    shipper_leads: db.prepare("SELECT COUNT(*) as c FROM leads WHERE lead_type='Shipper'").get().c,
    campaigns_sent: db.prepare("SELECT COUNT(*) as c FROM ai_campaigns WHERE status='Sent'").get().c,
    by_source: db.prepare("SELECT source, COUNT(*) as count FROM leads GROUP BY source").all(),
  };
  res.json(stats);
});

// GET /api/marketing/campaigns
router.get('/campaigns', auth, adminOnly, (req, res) => {
  res.json(getDB().prepare('SELECT ac.*, l.company_name as lead_name FROM ai_campaigns ac LEFT JOIN leads l ON ac.target_lead_id = l.id ORDER BY ac.created_at DESC').all());
});

module.exports = router;
