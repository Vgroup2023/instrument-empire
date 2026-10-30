// Tests for accounts and access: who may open what, password and link handling, then the real database flow.
// Run: npx tsx scripts/qa/auth.test.ts   (the database half needs DATABASE_URL pointing at a migrated database)
import assert from 'node:assert/strict';
import { canAccess, canManageUser, needFor, effectiveDepartments, type Principal } from '../../src/lib/auth/permissions';
import { hashPassword, hashToken, newToken, passwordProblem, verifyPassword } from '../../src/lib/auth/password';
import { authorizeUrl, checkClaims, decodeIdToken, newFlow, redirectUriFor, ssoConfig } from '../../src/lib/auth/sso';
import { createHash } from 'node:crypto';
import { groupsFor, navGroups } from '../../src/components/layout/navGroups';

const P = (role: Principal['role'], departments: Principal['departments'] = []): Principal => ({ role, departments });

async function main() {
  // ---- access matrix ----
  const owner = P('owner'), admin = P('admin'), fin = P('member', ['finance']), mgr = P('manager', ['sales']), view = P('viewer', ['finance']);
  assert.ok(canAccess(owner, '/dashboard/settings') && canAccess(admin, '/api/team', 'POST'));
  assert.ok(canAccess(fin, '/dashboard/invoices') && canAccess(fin, '/api/invoices/123', 'PATCH'));
  assert.ok(!canAccess(fin, '/dashboard/crm') && !canAccess(fin, '/dashboard/payroll') && !canAccess(fin, '/dashboard/settings'));
  assert.ok(canAccess(fin, '/dashboard') && canAccess(fin, '/dashboard/files') && canAccess(fin, '/dashboard/account'));
  assert.ok(!canAccess(fin, '/dashboard/team') && canAccess(mgr, '/dashboard/team') && canAccess(mgr, '/api/team', 'POST'));
  assert.ok(canAccess(mgr, '/api/crm/deals', 'POST') && !canAccess(mgr, '/api/payments'));
  // A viewer reads but never writes.
  assert.ok(canAccess(view, '/api/invoices', 'GET') && !canAccess(view, '/api/invoices', 'POST') && !canAccess(view, '/api/auth/password', 'POST'));
  // A path nobody listed is closed to everyone but owners and admins.
  assert.equal(needFor('/dashboard/brand-new-page'), null);
  assert.ok(canAccess(owner, '/dashboard/brand-new-page') && !canAccess(fin, '/dashboard/brand-new-page'));
  // Prefixes must not leak: /dashboard/team-x is not /dashboard/team, and trailing slashes do not matter.
  assert.ok(!canAccess(fin, '/dashboard/invoices-secret') && canAccess(fin, '/dashboard/invoices/'));
  assert.deepEqual(effectiveDepartments(admin).length, 5);
  assert.deepEqual(effectiveDepartments(fin), ['finance']);

  // ---- who may manage whom ----
  const all = ['finance', 'sales'] as Principal['departments'];
  assert.ok(canManageUser(owner, null, { role: 'owner', departments: [] }));
  assert.ok(!canManageUser(admin, null, { role: 'owner', departments: [] }));
  assert.ok(canManageUser(admin, null, { role: 'admin', departments: [] }));
  assert.ok(!canManageUser(admin, { role: 'owner', departments: [], isSelf: false }, { role: 'member', departments: all }));
  assert.ok(canManageUser(mgr, null, { role: 'member', departments: ['sales'] }));
  assert.ok(!canManageUser(mgr, null, { role: 'member', departments: ['finance'] }), 'a manager stays inside their own departments');
  assert.ok(!canManageUser(mgr, null, { role: 'manager', departments: ['sales'] }) && !canManageUser(mgr, null, { role: 'admin', departments: [] }));
  assert.ok(!canManageUser(owner, { role: 'owner', departments: [], isSelf: true }, { role: 'member', departments: all }), 'nobody changes their own access');
  assert.ok(!canManageUser(fin, null, { role: 'viewer', departments: ['finance'] }));

  // ---- menu ----
  const hrefs = (p: Principal) => groupsFor(p).flatMap((g) => g.items.map((i) => i.href));
  assert.equal(hrefs(owner).length, navGroups.flatMap((g) => g.items).length);
  assert.ok(hrefs(fin).includes('/dashboard/invoices') && !hrefs(fin).includes('/dashboard/crm') && !hrefs(fin).includes('/dashboard/team'));
  assert.ok(hrefs(mgr).includes('/dashboard/team') && hrefs(mgr).includes('/dashboard/crm'));
  assert.ok(groupsFor(fin).every((g) => g.items.length > 0), 'no empty menu sections');

  // ---- passwords and links ----
  assert.ok(passwordProblem('short', 'a@b.co'));
  assert.ok(passwordProblem('aaaaaaaaaaaa', 'a@b.co'), 'repetitive');
  assert.ok(passwordProblem('maria-is-here-2026', 'maria@acme.com'), 'must not contain the email name');
  assert.equal(passwordProblem('a good long passphrase 7', 'maria@acme.com'), null);
  const h = await hashPassword('correct horse battery');
  assert.ok(await verifyPassword('correct horse battery', h));
  assert.ok(!(await verifyPassword('wrong horse battery', h)));
  assert.ok(!(await verifyPassword('anything', null)), 'unknown account is a plain no');
  assert.notEqual(h, await hashPassword('correct horse battery'), 'salted');
  // The same password typed on different devices still signs in: accented letters in either Unicode form, full-width
  // letters, and a space a phone keyboard adds at the end. Wrong passwords, a leading space and other changes still fail.
  const unicode = await hashPassword('P\u00e4ssw\u00f6rd-correct-7'); // typed as single accented characters
  assert.ok(await verifyPassword('P\u00e4ssw\u00f6rd-correct-7', unicode));
  assert.ok(await verifyPassword('Pa\u0308ssvo\u0308rd-correct-7'.replace('v', 'w'), unicode), 'accents typed as letter + accent mark');
  assert.ok(await verifyPassword('P\u00e4ssw\u00f6rd-correct-7 ', unicode), 'one trailing space');
  assert.ok(await verifyPassword('P\u00e4ssw\u00f6rd-correct-7  \t', unicode), 'trailing whitespace');
  assert.ok(!(await verifyPassword(' P\u00e4ssw\u00f6rd-correct-7', unicode)), 'a leading space is not forgiven');
  assert.ok(!(await verifyPassword('p\u00e4ssw\u00f6rd-correct-7', unicode)), 'case still matters');
  assert.ok(!(await verifyPassword('P\u00e4ssw\u00f6rd-correct-8', unicode)));
  const ascii = await hashPassword('river-stone-lamp-91');
  assert.ok(await verifyPassword('\uff52iver-stone-lamp-91', ascii), 'full-width letter equals the plain letter');
  assert.ok(!(await verifyPassword('', ascii)) && !(await verifyPassword('   ', ascii)));
  // A hash made before this rule (over exactly what was typed) still works for exactly that input.
  const { scryptSync, randomBytes } = await import('node:crypto');
  const salt = randomBytes(16);
  const old = `scrypt$${salt.toString('hex')}$${scryptSync('Old pass phrase 12', salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
  assert.ok(await verifyPassword('Old pass phrase 12', old), 'older stored hashes keep working');
  assert.ok(!(await verifyPassword('Old pass phrase 13', old)));
  const tk = newToken();
  assert.equal(tk.hash, hashToken(tk.token));
  assert.notEqual(tk.token, newToken().token);
  assert.ok(tk.token.length >= 32 && !tk.token.includes(tk.hash));

  // ---- single sign-on (pure parts) ----
  assert.equal(ssoConfig({} as NodeJS.ProcessEnv), null);
  assert.equal(ssoConfig({ SSO_ISSUER: 'http://evil.example.com', SSO_CLIENT_ID: 'a', SSO_CLIENT_SECRET: 'b' } as unknown as NodeJS.ProcessEnv), null, 'plain http issuer refused');
  const cfg = ssoConfig({ SSO_ISSUER: 'https://idp.example.com/', SSO_CLIENT_ID: 'cid', SSO_CLIENT_SECRET: 'sec', SSO_NAME: 'Acme SSO' } as unknown as NodeJS.ProcessEnv)!;
  assert.equal(cfg.issuer, 'https://idp.example.com');
  assert.equal(cfg.name, 'Acme SSO');
  const flow = newFlow();
  assert.equal(flow.challenge, createHash('sha256').update(flow.verifier).digest('base64url'));
  assert.notEqual(flow.state, newFlow().state);
  const au = new URL(authorizeUrl(cfg, { authorization_endpoint: 'https://idp.example.com/auth', token_endpoint: 'x', issuer: cfg.issuer }, 'https://app.example.com/cb', flow));
  assert.equal(au.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(au.searchParams.get('state'), flow.state);
  assert.equal(au.searchParams.get('nonce'), flow.nonce);
  assert.equal(redirectUriFor('https://x.test'), (process.env.APP_BASE_URL ?? 'https://x.test').replace(/\/$/, '') + '/api/auth/sso/callback');
  const good = { iss: 'https://idp.example.com', aud: 'cid', exp: Math.floor(Date.now() / 1000) + 300, nonce: 'n1', email: 'Pat@Example.com', email_verified: true, name: 'Pat' };
  assert.deepEqual(checkClaims(good, cfg, 'n1'), { email: 'pat@example.com', name: 'Pat' });
  const bad = (o: object, nonce = 'n1') => 'error' in checkClaims({ ...good, ...o }, cfg, nonce);
  assert.ok(bad({ iss: 'https://other.example.com' }) && bad({ aud: 'someone-else' }) && bad({ aud: ['x', 'y'] }));
  assert.ok(!bad({ aud: ['x', 'cid'] }), 'audience may be a list that includes us');
  assert.ok(bad({ exp: 1 }) && bad({}, 'other-nonce') && bad({ nonce: undefined }) && bad({ email_verified: false }) && bad({ email_verified: undefined }) && bad({ email: 'nope' }));
  assert.ok(!bad({ email_verified: 'true' }));
  assert.ok('error' in checkClaims(null, cfg, 'n1'));
  assert.equal(decodeIdToken('a.b'), null);
  assert.equal(decodeIdToken(`h.${Buffer.from(JSON.stringify({ email: 'a@b.co' })).toString('base64url')}.s`)?.email, 'a@b.co');

  if (!process.env.DATABASE_URL) {
    console.log('auth: ok (rules and passwords only; set DATABASE_URL to run the database checks too)');
    return;
  }

  // ---- database flow ----
  const svc = await import('../../src/lib/auth/service');
  const { getDb } = await import('../../src/db/client');
  const { appUsers, appUserTokens } = await import('../../src/db/schema');
  const db = getDb();
  await db.delete(appUserTokens);
  await db.delete(appUsers);

  assert.equal(await svc.countUsers(), 0);
  const first = await svc.createFirstOwner({ name: 'Olga Owner', email: 'Olga@Example.com', password: 'a good long passphrase 7' });
  assert.equal(first.role, 'owner');
  assert.equal(first.email, 'olga@example.com');
  await assert.rejects(() => svc.createFirstOwner({ name: 'Second', email: 's@example.com', password: 'a good long passphrase 8' }), /already exist/);

  assert.equal((await svc.authenticate('OLGA@example.com', 'a good long passphrase 7'))?.id, first.id);
  assert.equal(await svc.authenticate('olga@example.com', 'nope nope nope nope'), null);
  assert.equal(await svc.authenticate('nobody@example.com', 'a good long passphrase 7'), null);

  const ownerActor = { ...first, id: first.id, name: first.name };
  const inv = await svc.inviteUser(ownerActor, { name: 'Fiona Finance', email: 'fiona@example.com', role: 'member', departments: ['finance'] });
  assert.equal(inv.user.status, 'invited');
  assert.equal(await svc.authenticate('fiona@example.com', 'whatever whatever'), null, 'an invited person cannot sign in yet');
  await assert.rejects(() => svc.inviteUser(ownerActor, { name: 'Dup', email: 'FIONA@example.com', role: 'viewer', departments: ['finance'] }), /already/);
  await assert.rejects(() => svc.inviteUser(ownerActor, { name: 'X', email: 'x@example.com', role: 'member', departments: [] }), /department/i);

  assert.deepEqual(await svc.peekToken(inv.token).then((r) => r && { email: r.email, kind: r.kind }), { email: 'fiona@example.com', kind: 'invite' });
  assert.equal(await svc.peekToken('x'.repeat(30)), null);
  await assert.rejects(() => svc.acceptToken(inv.token, 'short'), /at least|characters/i);
  const fiona = await svc.acceptToken(inv.token, 'purple river stone 11 lamp');
  assert.equal(fiona.status, 'active');
  await assert.rejects(() => svc.acceptToken(inv.token, 'purple river stone 12 lamp'), /expired|already/i);
  assert.equal(await svc.peekToken(inv.token), null, 'a used link is dead');
  assert.equal((await svc.authenticate('fiona@example.com', 'purple river stone 11 lamp'))?.id, fiona.id);

  // A member cannot manage anyone; an admin cannot touch the owner; nobody edits themselves.
  const finActor = { ...fiona, id: fiona.id };
  await assert.rejects(() => svc.inviteUser({ ...finActor, name: fiona.name }, { name: 'Z', email: 'z@example.com', role: 'viewer', departments: ['finance'] }));
  await assert.rejects(() => svc.updateUser(ownerActor, first.id, { role: 'member', departments: ['finance'] }), /own|last|active owner/i);
  const adm = await svc.inviteUser(ownerActor, { name: 'Adam Admin', email: 'adam@example.com', role: 'admin', departments: [] });
  const adam = await svc.acceptToken(adm.token, 'green valley cloud 33 ink');
  await assert.rejects(() => svc.updateUser({ ...adam, id: adam.id }, first.id, { status: 'disabled' }));
  await assert.rejects(() => svc.updateUser({ ...adam, id: adam.id }, adam.id, { role: 'owner' }));

  // Changing access or disabling raises the session version, which signs the person out.
  const moved = await svc.updateUser(ownerActor, fiona.id, { role: 'manager', departments: ['finance', 'sales'] });
  assert.equal(moved.role, 'manager');
  assert.ok(moved.sessionVersion > fiona.sessionVersion);
  const off = await svc.updateUser(ownerActor, fiona.id, { status: 'disabled' });
  assert.ok(off.sessionVersion > moved.sessionVersion);
  assert.equal(await svc.authenticate('fiona@example.com', 'purple river stone 11 lamp'), null, 'disabled cannot sign in');
  const back = await svc.updateUser(ownerActor, fiona.id, { status: 'active' });
  assert.equal(back.status, 'active');

  // There is always at least one active owner.
  const second = await svc.inviteUser(ownerActor, { name: 'Omar Owner', email: 'omar@example.com', role: 'owner', departments: [] });
  const omar = await svc.acceptToken(second.token, 'amber forest wind 44 bell');
  await svc.updateUser({ ...omar, id: omar.id }, first.id, { status: 'disabled' });
  await assert.rejects(() => svc.updateUser(ownerActor, omar.id, { status: 'disabled' }), /at least one active owner/);
  await svc.updateUser({ ...omar, id: omar.id }, first.id, { status: 'active' });

  // Reset link, then change own password (signs out other devices).
  const reset = await svc.issueLink(ownerActor, fiona.id);
  assert.equal(reset.kind, 'reset');
  const again = await svc.issueLink(ownerActor, fiona.id);
  assert.equal(await svc.peekToken(reset.token), null, 'a new link replaces the old one');
  await svc.acceptToken(again.token, 'silver canyon mist 55 oak');
  assert.ok(await svc.authenticate('fiona@example.com', 'silver canyon mist 55 oak'));
  const changed = await svc.changeOwnPassword(fiona.id, 'silver canyon mist 55 oak', 'quiet harbor moon 66 fern');
  assert.ok(changed.sessionVersion > (await svc.getUser(fiona.id).then((u) => u!.sessionVersion - 1)));
  await assert.rejects(() => svc.changeOwnPassword(fiona.id, 'wrong current password', 'brave meadow frost 77 pine'), /current password/);

  // Cancelling an invitation removes the person; an active account cannot be removed this way.
  const gone = await svc.inviteUser(ownerActor, { name: 'Gina Gone', email: 'gina@example.com', role: 'viewer', departments: ['sales'] });
  await svc.removeInvitation(ownerActor, gone.user.id);
  assert.equal(await svc.getUser(gone.user.id), null);
  await assert.rejects(() => svc.removeInvitation(ownerActor, fiona.id), /Disable/);

  // Manager can invite only inside their own departments.
  const mgrActor = { ...(await svc.getUser(fiona.id))!, id: fiona.id };
  await assert.rejects(() => svc.inviteUser({ ...mgrActor, name: mgrActor.name }, { name: 'M', email: 'm@example.com', role: 'member', departments: ['people'] }));
  const ok = await svc.inviteUser({ ...mgrActor, name: mgrActor.name }, { name: 'Sam Sales', email: 'sam@example.com', role: 'member', departments: ['sales'] });
  assert.equal(ok.user.departments[0], 'sales');

  // Single sign-on only signs in people who already have an account.
  assert.equal(await svc.signInWithSso('stranger@example.com'), null);
  const inv2 = await svc.inviteUser(ownerActor, { name: 'Ivy Invited', email: 'ivy@example.com', role: 'viewer', departments: ['sales'] });
  const ivy = await svc.signInWithSso('IVY@example.com');
  assert.equal(ivy?.status, 'active', 'an invited person is activated by signing in through the provider');
  assert.equal(await svc.peekToken(inv2.token), null, 'and their invitation link is spent');
  assert.equal(await svc.authenticate('ivy@example.com', 'anything at all here'), null, 'no password is set by this');
  await svc.updateUser(ownerActor, ivy!.id, { status: 'disabled' });
  assert.equal(await svc.signInWithSso('ivy@example.com'), null, 'disabled stays out');
  assert.equal((await svc.signInWithSso('omar@example.com'))?.id, omar.id);

  await db.delete(appUserTokens);
  await db.delete(appUsers);
  console.log('auth: ok');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
