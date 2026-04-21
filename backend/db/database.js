const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'freight_empire.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDB() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'carrier')),
      carrier_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS carriers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      mc_number TEXT UNIQUE NOT NULL,
      dot_number TEXT UNIQUE NOT NULL,
      contact_name TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      equipment_types TEXT NOT NULL,
      preferred_lanes TEXT,
      insurance_file TEXT,
      w9_file TEXT,
      factoring_company TEXT,
      factoring_contact TEXT,
      insurance_status TEXT DEFAULT 'Pending',
      safety_status TEXT DEFAULT 'Unknown',
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
      rejection_reason TEXT,
      fmcsa_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS loads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_number TEXT UNIQUE NOT NULL,
      pickup_location TEXT NOT NULL,
      pickup_state TEXT NOT NULL,
      delivery_location TEXT NOT NULL,
      delivery_state TEXT NOT NULL,
      rate REAL NOT NULL,
      equipment_type TEXT NOT NULL,
      weight TEXT,
      commodity TEXT,
      pickup_date TEXT NOT NULL,
      delivery_date TEXT NOT NULL,
      pickup_time TEXT,
      special_instructions TEXT,
      status TEXT DEFAULT 'Available' CHECK(status IN ('Available', 'Booked', 'In Transit', 'Completed', 'Cancelled')),
      booked_carrier_id INTEGER,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      load_id INTEGER NOT NULL,
      carrier_id INTEGER NOT NULL,
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected', 'Completed')),
      driver_name TEXT,
      driver_phone TEXT,
      truck_number TEXT,
      trailer_number TEXT,
      payment_status TEXT DEFAULT 'Unpaid' CHECK(payment_status IN ('Unpaid', 'Invoiced', 'Paid')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      lead_type TEXT DEFAULT 'Carrier' CHECK(lead_type IN ('Carrier', 'Shipper', 'Both')),
      source TEXT DEFAULT 'Manual',
      mc_number TEXT,
      dot_number TEXT,
      equipment_types TEXT,
      preferred_lanes TEXT,
      status TEXT DEFAULT 'New' CHECK(status IN ('New', 'Contacted', 'Qualified', 'Converted', 'Lost')),
      notes TEXT,
      last_contacted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('Email', 'SMS')),
      target_lead_id INTEGER,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'Draft' CHECK(status IN ('Draft', 'Sent')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default admin
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@freightempire.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(adminEmail, hash, 'admin');
    console.log(`Admin seeded: ${adminEmail} / ${adminPassword}`);
  }

  console.log('Database initialized');
}

module.exports = { getDB, initDB };
