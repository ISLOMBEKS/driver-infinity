const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export const farcasterConfig = {
  accountAssociation: {
    header: '',
    payload: '',
    signature: '',
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
