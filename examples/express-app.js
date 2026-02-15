/**
 * AuthSnap — Express Example (All 6 Providers)
 *
 * This demonstrates the 3-line setup from the blueprint:
 *   1. Create an AuthSnap instance with your providers
 *   2. Mount it on your Express app
 *   3. Protect routes with auth.protect()
 *
 * Setup:
 *   1. Copy .env.example to .env and fill in your OAuth credentials
 *   2. Run: node examples/express-app.js
 *   3. Open http://localhost:3000
 *
 * Only providers with credentials in .env will be registered.
 *
 * Routes created automatically for each configured provider:
 *   GET /auth/{provider}           → Start OAuth login
 *   GET /auth/{provider}/callback  → OAuth callback
 *   GET /auth/logout               → Clear session
 */

import 'dotenv/config';
import express from 'express';
import { AuthSnap } from '../src/index.js';

const app = express();

// Apple callback uses response_mode=form_post, so we need body parsing
app.use(express.urlencoded({ extended: true }));

// ─── Build providers object (only include those with env vars set) ───
const providers = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: ['email', 'profile'],
  };
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  providers.discord = {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    scopes: ['identify', 'email'],
  };
}

if (process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
  providers.twitter = {
    clientId: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
  };
}

if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
  providers.apple = {
    clientId: process.env.APPLE_CLIENT_ID,
    clientSecret: process.env.APPLE_CLIENT_SECRET,
    // For auto-generated client secrets, provide these instead of clientSecret:
    // teamId: process.env.APPLE_TEAM_ID,
    // keyId: process.env.APPLE_KEY_ID,
    // privateKey: process.env.APPLE_PRIVATE_KEY,
  };
}

if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  providers.microsoft = {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    // tenant: 'common',  // 'common' | 'consumers' | 'organizations' | '<tenant-id>'
  };
}

if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
  providers.linkedin = {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  };
}

if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
  providers.spotify = {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  };
}

if (Object.keys(providers).length === 0) {
  console.error('No providers configured. Add at least one provider\'s credentials to .env');
  console.error('See .env.example for the required variables.');
  process.exit(1);
}

// ─── 1. Configure AuthSnap ───────────────────────────────────────────
const auth = new AuthSnap({
  providers,
  session: {
    strategy: 'jwt',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  },
  callbacks: {
    onSuccess: async (user, tokens, provider) => {
      console.log(`[AuthSnap] Login via ${provider}: ${user.email}`);
      return { redirect: '/dashboard' };
    },
    onError: (error, provider) => {
      console.error(`[AuthSnap] Error (${provider}): ${error.message}`);
      return { redirect: '/?error=auth_failed' };
    },
    onTokenRefresh: (newTokens, provider) => {
      console.log(`[AuthSnap] Token refreshed for ${provider}`);
    },
  },
});

// ─── 2. Mount all auth routes (one line) ─────────────────────────────
app.use(auth.express());

// ─── 3. Protect routes ──────────────────────────────────────────────
app.get('/dashboard', auth.protect(), (req, res) => {
  res.send(`
    <html>
      <head><title>Dashboard — AuthSnap</title></head>
      <body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 60px auto;">
        <h1>Dashboard</h1>
        <p>You are logged in!</p>
        <pre style="background: #f4f4f4; padding: 16px; border-radius: 8px; overflow-x: auto;">${JSON.stringify(req.user, null, 2)}</pre>
        <p><a href="/auth/logout">Logout</a></p>
        <p><a href="/">Home</a></p>
      </body>
    </html>
  `);
});

// ─── Public routes ───────────────────────────────────────────────────
const allProviders = [
  { name: 'google',    label: 'Google',        color: '#4285F4' },
  { name: 'github',    label: 'GitHub',        color: '#24292e' },
  { name: 'discord',   label: 'Discord',       color: '#5865F2' },
  { name: 'twitter',   label: 'Twitter / X',   color: '#1DA1F2' },
  { name: 'apple',     label: 'Apple',         color: '#000000' },
  { name: 'microsoft', label: 'Microsoft',     color: '#00a4ef' },
  { name: 'linkedin',  label: 'LinkedIn',      color: '#0A66C2' },
  { name: 'spotify',   label: 'Spotify',       color: '#1DB954' },
];

app.get('/', (req, res) => {
  const buttons = allProviders
    .filter(p => providers[p.name])
    .map(p => `<li><a href="/auth/${p.name}" style="background:${p.color}">Login with ${p.label}</a></li>`)
    .join('\n          ');

  res.send(`
    <html>
      <head>
        <title>AuthSnap Example</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 20px; }
          h1 { margin-bottom: 8px; }
          .subtitle { color: #666; margin-top: 0; }
          .providers { list-style: none; padding: 0; }
          .providers li { margin: 8px 0; }
          .providers a {
            display: inline-block;
            padding: 10px 20px;
            text-decoration: none;
            color: #fff;
            border-radius: 6px;
            font-weight: 500;
            min-width: 220px;
            text-align: center;
          }
          .links { margin-top: 24px; }
          .links a { margin-right: 16px; }
        </style>
      </head>
      <body>
        <h1>AuthSnap</h1>
        <p class="subtitle">Zero-boilerplate OAuth for Node.js</p>

        <h3>Login with a provider:</h3>
        <ul class="providers">
          ${buttons}
        </ul>

        <div class="links">
          <a href="/dashboard">Dashboard (protected)</a>
          <a href="/auth/logout">Logout</a>
        </div>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
const configured = Object.keys(providers);
app.listen(PORT, () => {
  console.log(`\nAuthSnap example running at http://localhost:${PORT}\n`);
  console.log(`Configured providers: ${configured.join(', ')}`);
  console.log(`Auth routes: ${configured.map(p => `/auth/${p}`).join(', ')}`);
  console.log('');
});
