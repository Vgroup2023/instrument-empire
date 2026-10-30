/**
 * Gmail to CRM bridge (Google Apps Script).
 *
 * Every few minutes it takes the messages carrying one Gmail label (default "CRM") and posts them to the CRM's email
 * endpoint, so each one is filed on the right contact and deal. Mail from your own addresses is recorded as sent.
 * Nothing here ever sends or deletes mail. The CRM ignores a message it has already recorded, so running twice is safe.
 *
 * All settings live in Script properties (Project settings > Script properties), not in this code, so switching to
 * another mailbox means pasting this script into that account and entering the same five properties:
 *   CRM_URL       https://globlexus.globlexai.com        (your site, no trailing slash)
 *   CRM_KEY       the INTEGRATION_KEY set in Netlify
 *   LABEL         CRM                                     (the Gmail label to record; optional)
 *   MY_ADDRESSES  globlexai@gmail.com,you@company.com     (mail from these counts as sent by you; optional)
 *   SINCE_DAYS    3                                       (how far back the very first run looks; optional)
 */

var MAX_PER_RUN = 100;

function settings_() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('CRM_URL') || '').replace(/\/+$/, '');
  var key = p.getProperty('CRM_KEY') || '';
  if (!url || !key) throw new Error('Set CRM_URL and CRM_KEY in Project settings > Script properties.');
  return {
    url: url,
    key: key,
    label: p.getProperty('LABEL') || 'CRM',
    mine: (p.getProperty('MY_ADDRESSES') || Session.getEffectiveUser().getEmail()).toLowerCase().split(',').map(function (s) { return s.trim(); }).filter(Boolean),
    sinceDays: Number(p.getProperty('SINCE_DAYS')) || 3,
    props: p,
  };
}

function address_(s) {
  var m = String(s || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(s || '')).trim().toLowerCase();
}

/** Records new labeled messages. This is the function the timer runs. */
function sync() {
  var cfg = settings_();
  var last = Number(cfg.props.getProperty('LAST_RUN')) || (Date.now() - cfg.sinceDays * 86400000);
  var started = Date.now();
  // A 5 minute overlap catches anything that arrived while the last run was going; the CRM drops repeats.
  var cutoff = last - 5 * 60000;
  var days = Math.max(1, Math.ceil((started - cutoff) / 86400000) + 1);
  var threads = GmailApp.search('label:"' + cfg.label + '" newer_than:' + days + 'd', 0, 50);
  var sent = 0, failed = 0;

  outer:
  for (var i = 0; i < threads.length; i++) {
    var msgs = threads[i].getMessages();
    for (var j = 0; j < msgs.length; j++) {
      var m = msgs[j];
      if (m.getDate().getTime() < cutoff) continue;
      if (sent + failed >= MAX_PER_RUN) break outer;
      var from = m.getFrom();
      var out = cfg.mine.indexOf(address_(from)) >= 0;
      var body = (m.getPlainBody() || '').substring(0, 8000);
      var res = UrlFetchApp.fetch(cfg.url + '/api/integrations/crm/email', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + cfg.key },
        muteHttpExceptions: true,
        payload: JSON.stringify({
          direction: out ? 'out' : 'in',
          from: from,
          to: m.getTo(),
          subject: m.getSubject(),
          body: body,
          messageId: m.getHeader('Message-ID') || m.getId(),
        }),
      });
      if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) sent++;
      else { failed++; console.error('CRM answered ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 200)); }
    }
  }
  // Move the clock forward only when everything went through, so a failure is retried on the next run.
  if (failed === 0 && sent + failed < MAX_PER_RUN) cfg.props.setProperty('LAST_RUN', String(started));
  console.log('Recorded ' + sent + ' message(s), ' + failed + ' failed.');
}

/** Run once: makes the timer (every 5 minutes) and the label if it is missing. */
function install() {
  var cfg = settings_();
  if (!GmailApp.getUserLabelByName(cfg.label)) GmailApp.createLabel(cfg.label);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(5).create();
  console.log('Installed. Label "' + cfg.label + '" is watched every 5 minutes.');
}

/** Run to stop the bridge, for example before switching to another mailbox. */
function uninstall() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t); });
  console.log('Stopped. Nothing more will be sent from this mailbox.');
}

/** Run to check the connection: sends one harmless test message to the CRM. */
function test() {
  var cfg = settings_();
  var res = UrlFetchApp.fetch(cfg.url + '/api/integrations/crm/email', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + cfg.key },
    payload: JSON.stringify({ from: 'Bridge Test <bridge-test@example.com>', subject: 'Gmail bridge test', body: 'If you can read this in the CRM, the bridge works.', messageId: 'bridge-test-' + Date.now() }),
  });
  console.log('CRM answered ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 200));
}
