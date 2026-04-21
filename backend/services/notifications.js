const nodemailer = require('nodemailer');

function getEmailTransport() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  // Dev: log to console
  return null;
}

async function sendEmail(to, subject, body) {
  const db_log = require('../db/database').getDB();
  const logEntry = { type: 'Email', recipient: to, subject, message: body };

  try {
    const transport = getEmailTransport();
    if (transport) {
      await transport.sendMail({
        from: process.env.EMAIL_FROM || 'FreightEmpire <no-reply@freightempire.com>',
        to,
        subject,
        text: body,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><p>${body.replace(/\n/g, '<br>')}</p><hr><p style="color:#999;font-size:12px">FreightEmpire | Freight Brokerage Management</p></div>`,
      });
      db_log.prepare('INSERT INTO notifications (type, recipient, subject, message, status, sent_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)')
        .run('Email', to, subject, body, 'Sent');
    } else {
      console.log(`[EMAIL] To: ${to} | Subject: ${subject}\n${body}`);
      db_log.prepare('INSERT INTO notifications (type, recipient, subject, message, status) VALUES (?,?,?,?,?)')
        .run('Email', to, subject, body, 'Simulated');
    }
    return { success: true };
  } catch (err) {
    console.error('[EMAIL ERROR]', err.message);
    db_log.prepare('INSERT INTO notifications (type, recipient, subject, message, status) VALUES (?,?,?,?,?)')
      .run('Email', to, subject, body, 'Failed');
    return { success: false, error: err.message };
  }
}

async function sendSMS(to, message) {
  if (!to) return { success: false, error: 'No phone number' };
  const db_log = require('../db/database').getDB();

  try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await twilio.messages.create({ body: message, from: process.env.TWILIO_FROM_NUMBER, to });
      db_log.prepare('INSERT INTO notifications (type, recipient, message, status, sent_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)')
        .run('SMS', to, message, 'Sent');
    } else {
      console.log(`[SMS] To: ${to} | ${message}`);
      db_log.prepare('INSERT INTO notifications (type, recipient, message, status) VALUES (?,?,?,?)')
        .run('SMS', to, message, 'Simulated');
    }
    return { success: true };
  } catch (err) {
    console.error('[SMS ERROR]', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail, sendSMS };
