// What the sign-in page needs to know that cannot be known when the page is built: whether anyone has an account yet,
// whether the shared passphrase still works, and whether single sign-on is set up. Pure, so it can be tested.

export interface LoginMode {
  /** Someone has their own account, so sign-in is by email and password. */
  accounts: boolean;
  /** The shared passphrase form should be offered. */
  passphraseWorks: boolean;
  /** Single sign-on is set up; the button says "Sign in with {name}". */
  sso: { name: string } | null;
}

/** What the page shows before it has heard from the server: the normal state once accounts exist. */
export const DEFAULT_LOGIN_MODE: LoginMode = { accounts: true, passphraseWorks: false, sso: null };

export function loginModeFrom(i: { anyUsers: boolean | null; passphraseOn: boolean; sso: { name: string } | null }): LoginMode {
  // The database could not be reached: show the passphrase form so the owner is never locked out.
  if (i.anyUsers === null) return { accounts: false, passphraseWorks: true, sso: i.sso };
  return { accounts: i.anyUsers, passphraseWorks: !i.anyUsers || i.passphraseOn, sso: i.sso };
}
