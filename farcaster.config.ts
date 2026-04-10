const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://driver-infinity.onrender.com');

export const farcasterConfig = {
  accountAssociation: {
    header: 'eyJmaWQiOjEwNzU1NDEsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHg4ZTZkRTQxNjExYTZGRjQ1OWZlNjY0ZDJDM2Y5ZTYzYjRDZGQ5ZGJlIn0',
    payload: 'eyJkb21haW4iOiJkcml2ZXItaW5maW5pdHkub25yZW5kZXIuY29tIn0',
    signature: 'aldpf/LtymubWZ58EZ9TGPiNfDIbg/Ao850LL4Zu+rFBYBIslEuOONLEHI33ZnggA0+x/f2ncoCacaCxHAyW4hw=',
  },
  miniapp: {
    version: '1',
    name: 'Driver Infinity',
    subtitle: 'Endless Road Racing on Base',
    description:
      'Dodge falling barriers, build your streak, climb the leaderboard. A synthwave endless racer built on Base.',
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: '#0d1117',
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: 'games',
    tags: ['racing', 'endless', 'base', 'onchain'],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: 'Race. Survive. Dominate.',
    ogTitle: 'Driver Infinity — Race on Base',
    ogDescription: 'Dodge falling barriers, earn your streak, top the leaderboard.',
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
} as const;
