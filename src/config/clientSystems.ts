// Client businesses shown under "Connect to your business ERP" on the sign-in page.
//
// Each client's master ERP address is read from an environment variable, so a
// link can be added or changed in the hosting settings without touching code:
//
//   CLIENT_ERP_URL_BLUESTAR       BlueStar IMEX-CHB
//   CLIENT_ERP_URL_DRSIMPLICIOS   DRSimplicios
//
// A client with no address set shows as "Link coming soon" and is not clickable.
// To add another client, add a line to CLIENT_SYSTEMS and a matching variable.

export interface ClientSystem {
  id: string;
  name: string;
  descriptor: string;
  /** Name of the environment variable that holds this client's ERP address. */
  envVar: string;
}

export const CLIENT_SYSTEMS: ClientSystem[] = [
  {
    id: 'bluestar',
    name: 'BlueStar IMEX-CHB',
    descriptor: 'Global Trade Solutions · Compliance · Customs Brokerage',
    envVar: 'CLIENT_ERP_URL_BLUESTAR',
  },
  {
    id: 'drsimplicios',
    name: 'DRSimplicios',
    descriptor: 'Senior Transition Concierge Services',
    envVar: 'CLIENT_ERP_URL_DRSIMPLICIOS',
  },
];

/** Only https addresses are accepted, so a typo or a bad value can never put a script or odd link on the page. */
export function safeExternalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export interface ResolvedClientSystem extends ClientSystem {
  href: string | null;
}

export function getClientSystems(): ResolvedClientSystem[] {
  return CLIENT_SYSTEMS.map((c) => ({ ...c, href: safeExternalUrl(process.env[c.envVar]) }));
}
