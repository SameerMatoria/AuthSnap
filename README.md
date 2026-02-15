# AuthSnap

**Zero-boilerplate OAuth for any Node.js framework.**
Add Google, GitHub, Discord, Twitter, Apple, or Microsoft authentication to your app in 3 lines of code. Works with Express, Fastify, and Hono.

```js
const auth = new AuthSnap({ providers: { google: { clientId, clientSecret } }, session: { secret } });
app.use(auth.express());
app.get('/dashboard', auth.protect(), (req, res) => res.json({ user: req.user }));
```

---

## Table of Contents

- [How It Works — The Complete OAuth Flow](#how-it-works--the-complete-oauth-flow)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Express](#express)
  - [Fastify](#fastify)
  - [Hono](#hono)
- [Configuration Reference](#configuration-reference)
  - [Providers](#providers)
  - [Session](#session)
  - [Callbacks (Hooks)](#callbacks-hooks)
  - [Options](#options)
- [All Providers](#all-providers)
  - [Google](#google)
  - [GitHub](#github)
  - [Discord](#discord)
  - [Twitter / X](#twitter--x)
  - [Apple](#apple)
  - [Microsoft](#microsoft)
- [Custom Providers](#custom-providers)
- [The AuthUser Object](#the-authuser-object)
- [Session Management — How It Works Under the Hood](#session-management--how-it-works-under-the-hood)
  - [JWT Creation](#1-jwt-creation)
  - [Cookie Storage](#2-cookie-storage)
  - [Session Verification](#3-session-verification)
  - [Logout / Session Clearing](#4-logout--session-clearing)
- [Token Storage and Refresh](#token-storage-and-refresh)
- [Lifecycle Hooks — Deep Dive](#lifecycle-hooks--deep-dive)
  - [onBeforeAuth](#onbeforeauth)
  - [onSuccess](#onsuccess)
  - [onError](#onerror)
  - [onTokenRefresh](#ontokenrefresh)
- [Route Protection Middleware](#route-protection-middleware)
- [Rate Limiting](#rate-limiting)
- [Security](#security)
  - [CSRF / State Protection](#csrf--state-protection)
  - [Open Redirect Prevention](#open-redirect-prevention)
- [Pluggable Token Store](#pluggable-token-store)
- [Auto-Generated Routes](#auto-generated-routes)
- [Error Handling](#error-handling)
- [API Reference — Key Classes](#api-reference--key-classes)
- [Running the Example](#running-the-example)
- [Running Tests](#running-tests)

---

## How It Works — The Complete OAuth Flow

Here is every step that happens when a user clicks "Login with Google" (or any provider), from start to finish:

```
  User's Browser                  Your Server (AuthSnap)              OAuth Provider (Google/GitHub)
       |                                  |                                      |
       |  1. GET /auth/google             |                                      |
       |--------------------------------->|                                      |
       |                                  |                                      |
       |  2. Generate CSRF state token    |                                      |
       |     Store state in cookie        |                                      |
       |     Fire onBeforeAuth hook       |                                      |
       |     Build authorization URL      |                                      |
       |                                  |                                      |
       |  3. 302 Redirect                 |                                      |
       |<---------------------------------|                                      |
       |                                                                         |
       |  4. User sees consent screen                                            |
       |------------------------------------------------------------------------>|
       |                                                                         |
       |  5. User clicks "Allow"                                                 |
       |                                                                         |
       |  6. 302 Redirect to /auth/google/callback?code=ABC&state=XYZ           |
       |<------------------------------------------------------------------------|
       |                                                                         |
       |  7. GET /auth/google/callback?code=ABC&state=XYZ                        |
       |--------------------------------->|                                      |
       |                                  |                                      |
       |                                  |  8. Validate state (CSRF check)      |
       |                                  |     Compare cookie state vs query    |
       |                                  |                                      |
       |                                  |  9. POST token exchange              |
       |                                  |------------------------------------->|
       |                                  |     (sends code + client_secret)     |
       |                                  |                                      |
       |                                  |  10. Receive tokens                  |
       |                                  |<-------------------------------------|
       |                                  |      { access_token, refresh_token } |
       |                                  |                                      |
       |                                  |  11. GET user profile                |
       |                                  |------------------------------------->|
       |                                  |     (sends Bearer access_token)      |
       |                                  |                                      |
       |                                  |  12. Receive user profile            |
       |                                  |<-------------------------------------|
       |                                  |                                      |
       |                                  |  13. Normalize to AuthUser shape     |
       |                                  |  14. Fire onSuccess hook             |
       |                                  |  15. Create JWT from AuthUser        |
       |                                  |  16. Set JWT in HttpOnly cookie      |
       |                                  |                                      |
       |  17. 302 Redirect to /dashboard  |                                      |
       |<---------------------------------|                                      |
       |                                                                         |
       |  Subsequent requests include the JWT cookie automatically               |
       |                                                                         |
       |  18. GET /dashboard              |                                      |
       |--------------------------------->|                                      |
       |                                  |  19. protect() middleware:           |
       |                                  |      Extract JWT from cookie         |
       |                                  |      Verify JWT signature + expiry   |
       |                                  |      Attach user to req.user         |
       |                                  |      Call next()                     |
       |                                  |                                      |
       |  20. { user: { id, email, ... }} |                                      |
       |<---------------------------------|                                      |
```

### Step-by-Step Breakdown

| Step | What Happens | Where |
|------|-------------|-------|
| **1** | User clicks a login link (e.g. `/auth/google`) | Browser |
| **2** | AuthSnap generates a 32-byte random **state** token for CSRF protection, stores it in a short-lived cookie (`authsnap_state`, 10 min TTL), and fires the `onBeforeAuth` hook | Express adapter |
| **3** | Browser is redirected (HTTP 302) to the provider's consent URL with `client_id`, `redirect_uri`, `scope`, `state`, and provider-specific params | Express adapter |
| **4–5** | User sees the provider's consent screen and clicks "Allow" | Provider (Google/GitHub) |
| **6** | Provider redirects back to your callback URL with an **authorization code** and the **state** token | Provider |
| **7** | AuthSnap receives the callback request | Express adapter |
| **8** | **CSRF validation** — the `state` from the query string is compared against the `state` stored in the cookie. If they don't match, the request is rejected | Express adapter |
| **9** | AuthSnap sends a POST request to the provider's **token endpoint**, exchanging the authorization code (plus `client_id` and `client_secret`) for access tokens | BaseProvider |
| **10** | Provider responds with an `access_token`, optionally a `refresh_token`, and expiry info | Provider |
| **11** | AuthSnap uses the `access_token` to call the provider's **user profile API** | Provider adapter |
| **12** | Provider returns the raw user profile (each provider has a different shape) | Provider |
| **13** | AuthSnap **normalizes** the raw profile into a unified `AuthUser` object — same fields regardless of provider | Provider adapter |
| **14** | The `onSuccess` hook fires with `(user, tokens, providerName)` — this is where you save the user to your database | Express adapter |
| **15** | A **JWT** is created containing the `AuthUser` payload, signed with HS256 using your secret | SessionManager |
| **16** | The JWT is set as an **HttpOnly, SameSite=Lax** cookie in the response | Express adapter |
| **17** | User is redirected to the URL returned by `onSuccess` (or `/` by default) | Express adapter |
| **18–19** | On subsequent requests, the `protect()` middleware extracts the JWT from the cookie, verifies it, and attaches `req.user` | Protect middleware |
| **20** | Your route handler accesses the authenticated user via `req.user` | Your code |

---

## Installation

```bash
npm install auth-snap
```

**Peer dependencies** (install the one you use):
```bash
npm install express              # if using Express
npm install fastify @fastify/cookie  # if using Fastify
npm install hono                 # if using Hono
```

> AuthSnap requires **Node.js 18+** (uses native `fetch`). Only runtime dependency: `jose` (JWT).

---

## Quick Start

### Express

```js
import express from 'express';
import { AuthSnap } from 'auth-snap';

const app = express();

const auth = new AuthSnap({
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },
  session: { secret: process.env.SESSION_SECRET },
  callbacks: {
    onSuccess: async (user, tokens, provider) => {
      console.log(`Logged in via ${provider}:`, user.email);
      return { redirect: '/dashboard' };
    },
    onError: (error, provider) => {
      console.error(`Auth failed (${provider}):`, error.message);
      return { redirect: '/login?error=auth_failed' };
    },
  },
});

app.use(auth.express());

app.get('/dashboard', auth.protect(), (req, res) => {
  res.json({ user: req.user });
});

app.listen(3000);
```

### Fastify

```js
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { AuthSnap } from 'auth-snap';

const fastify = Fastify();
await fastify.register(cookie);

const auth = new AuthSnap({
  providers: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET },
  },
  session: { secret: process.env.SESSION_SECRET },
});

await fastify.register(auth.fastify());

fastify.get('/dashboard', { preHandler: auth.protect() }, (req, reply) => {
  reply.send({ user: req.user });
});

fastify.listen({ port: 3000 });
```

### Hono

```js
import { Hono } from 'hono';
import { AuthSnap } from 'auth-snap';

const app = new Hono();

const auth = new AuthSnap({
  providers: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET },
  },
  session: { secret: process.env.SESSION_SECRET },
});

app.route('', auth.hono()(Hono));

export default app;
```

That's it. AuthSnap auto-registers these routes per provider:
- `GET /auth/{provider}` — Start OAuth login
- `GET /auth/{provider}/callback` — Handle OAuth callback
- `GET /auth/logout` — Clear session
- `GET /auth/error` — Error fallback

---

## Configuration Reference

### Providers

Each provider requires a `clientId` and `clientSecret` from the OAuth provider's developer console.

```js
providers: {
  google: {
    clientId: 'xxx',         // Required
    clientSecret: 'xxx',     // Required
    scopes: ['email', 'profile'],  // Optional — defaults vary by provider
    callbackURL: 'https://myapp.com/auth/google/callback',  // Optional — auto-detected
    prompt: 'consent',       // Optional — override default prompt behavior
  },
  github: { clientId: 'xxx', clientSecret: 'xxx' },
  discord: { clientId: 'xxx', clientSecret: 'xxx' },
  twitter: { clientId: 'xxx', clientSecret: 'xxx' },
  apple: { clientId: 'xxx', clientSecret: 'xxx' },
  microsoft: { clientId: 'xxx', clientSecret: 'xxx' },
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clientId` | `string` | Yes | OAuth client ID from the provider |
| `clientSecret` | `string` | Yes | OAuth client secret from the provider |
| `scopes` | `string[]` | No | Scopes to request. Each provider has sensible defaults |
| `callbackURL` | `string` | No | Full callback URL. Auto-detected from the request if not set |
| `prompt` | `string` | No | Override the default prompt behavior (e.g. `'consent'`, `'select_account'`) |

**Default scopes per provider:**

| Provider | Default Scopes | Default Prompt |
|----------|---------------|----------------|
| Google | `openid`, `email`, `profile` | `select_account consent` |
| GitHub | `read:user`, `user:email` | `select_account` |
| Discord | `identify`, `email` | `consent` |
| Twitter/X | `users.read`, `tweet.read` | — |
| Apple | `name`, `email` | Always shown |
| Microsoft | `openid`, `email`, `profile`, `User.Read` | `select_account` |

### Session

```js
session: {
  strategy: 'jwt',                    // 'jwt' (default) — session strategy
  secret: process.env.SESSION_SECRET, // Required — used to sign JWTs
  maxAge: 86400,                      // Optional — session lifetime in seconds (default: 24 hours)
  cookieName: 'authsnap_session',     // Optional — name of the session cookie
  secure: true,                       // Optional — set Secure flag on cookie (default: true)
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `strategy` | `'jwt'` \| `'cookie'` | `'jwt'` | Session strategy. JWT is the default and only currently supported strategy |
| `secret` | `string` | — | **Required.** Secret key used to sign and verify JWTs. Use a strong random string (32+ characters) |
| `maxAge` | `number` | `86400` | Session lifetime in seconds. Default is 24 hours (86400s) |
| `cookieName` | `string` | `'authsnap_session'` | Name of the cookie that stores the JWT |
| `secure` | `boolean` | `true` | Whether to set the `Secure` flag on cookies. Set to `false` for local development over HTTP |

### Callbacks (Hooks)

```js
callbacks: {
  onBeforeAuth: (provider, req) => { /* ... */ },
  onSuccess: async (user, tokens, provider) => { /* ... */ },
  onError: (error, provider) => { /* ... */ },
  onTokenRefresh: (tokens, provider) => { /* ... */ },
}
```

See the [Lifecycle Hooks — Deep Dive](#lifecycle-hooks--deep-dive) section below for full details.

### Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `basePath` | `string` | `'/auth'` | Base path prefix for all auth routes. Change to `'/api/auth'` if needed |
| `baseURL` | `string` | auto-detected | Base URL for callback generation. Auto-detected from the request |
| `tokenStore` | `object` | in-memory `TokenStore` | Custom token store — any object with `get/set/delete/has/isExpired` methods. See [Pluggable Token Store](#pluggable-token-store) |
| `rateLimit` | `object \| false` | `{ windowMs: 60000, max: 10 }` | Rate limiting config. Set to `false` to disable. See [Rate Limiting](#rate-limiting) |
| `allowedRedirects` | `string[]` | `undefined` | Allowed redirect origins after auth (prevents open redirects). See [Security](#security) |

---

## The AuthUser Object

Every provider returns the **same unified shape** — no matter if the user logged in with Google, GitHub, or any other provider:

```js
{
  id: '123456789',                        // Provider's unique user ID
  email: 'user@example.com',              // Primary email address
  name: 'John Doe',                       // Display name
  avatar: 'https://example.com/photo.jpg',// Profile picture URL (or null)
  provider: 'google',                     // Which provider authenticated this user
  emailVerified: true,                    // Whether the provider verified this email
  raw: { /* ... */ }                      // Full provider-specific profile (all original fields)
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | The provider's unique ID for this user. Always a string (GitHub IDs are converted from number) |
| `email` | `string` | The user's primary email. GitHub fetches this separately if the user's email is private |
| `name` | `string` | Display name. GitHub falls back to the username (`login`) if `name` is not set |
| `avatar` | `string \| null` | Profile picture URL, or `null` if none |
| `provider` | `string` | The provider name: `'google'`, `'github'`, etc. |
| `emailVerified` | `boolean` | Whether the provider confirmed this email is verified |
| `raw` | `object` | The complete, unmodified profile response from the provider. Use this for provider-specific data (e.g. Google's `hd` domain, GitHub's `login` username) |

---

## Session Management — How It Works Under the Hood

AuthSnap uses **JWT (JSON Web Tokens)** stored in **HttpOnly cookies** for session management. Here's exactly what happens at each stage:

### 1. JWT Creation

When a user successfully authenticates, the `SessionManager` creates a JWT:

```
SessionManager.createToken(user)
        |
        v
  +---------------------------+
  | JWT Payload               |
  |  {                        |
  |    user: { AuthUser },    |  ← Your unified user object
  |    iat: 1707600000,       |  ← Issued-at timestamp (auto)
  |    exp: 1707686400,       |  ← Expiration (iat + maxAge)
  |    iss: 'authsnap'        |  ← Issuer claim
  |  }                        |
  +---------------------------+
        |
        v
  Sign with HS256 + your secret
        |
        v
  eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjp7...  ← Compact JWT string
```

**Technical details:**
- **Algorithm:** HS256 (HMAC-SHA256) — symmetric signing using your `session.secret`
- **Library:** `jose` — a lightweight, standards-compliant JWT library with no dependencies
- **Secret encoding:** Your string secret is converted to `Uint8Array` via `TextEncoder` (required by jose)
- **Claims set:**
  - `iat` (issued at) — automatically set to current time
  - `exp` (expiration) — set to `iat + maxAge` seconds (default 24h)
  - `iss` (issuer) — always `'authsnap'`, validated during verification

### 2. Cookie Storage

The JWT is stored in the browser as an **HttpOnly cookie**:

```
Set-Cookie: authsnap_session=eyJhbG...; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax; Secure
```

Each flag has a specific security purpose:

| Cookie Attribute | Value | Why |
|-----------------|-------|-----|
| `HttpOnly` | always set | **Prevents JavaScript access.** `document.cookie` cannot read this cookie, protecting against XSS attacks |
| `SameSite=Lax` | always set | **Prevents CSRF on POST.** Cookie is sent on top-level navigations (clicking links) but NOT on cross-origin POST/AJAX requests |
| `Secure` | configurable | **HTTPS only.** When `true`, cookie is only sent over HTTPS. Set to `false` for `localhost` development |
| `Max-Age` | `86400` (default) | **Auto-expiry.** Cookie expires after this many seconds. Browser deletes it automatically |
| `Path=/` | always set | **Available site-wide.** Cookie is sent for all routes on your domain |

### 3. Session Verification

On every request to a protected route, the `protect()` middleware:

```
Incoming Request
      |
      v
Extract cookie from request
  ├── Check req.cookies (if cookie-parser is installed)
  └── Parse raw Cookie header (fallback — no middleware needed)
      |
      v
Cookie found?
  ├── No  → 401 Unauthorized (or redirect)
  └── Yes → Verify JWT
              |
              v
        jose.jwtVerify(token, secret, { issuer: 'authsnap' })
              |
              ├── Invalid signature → 401 Unauthorized
              ├── Expired (exp < now) → 401 Unauthorized
              ├── Wrong issuer → 401 Unauthorized
              └── Valid → Extract user from payload
                            |
                            v
                    req.user = payload.user
                    next()  → Your route handler runs
```

**Important:** AuthSnap parses cookies from the raw `Cookie` header if `cookie-parser` is not installed. You do NOT need any additional cookie middleware.

### 4. Logout / Session Clearing

When the user visits `/auth/logout`:

```
Set-Cookie: authsnap_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax
```

- The cookie value is set to empty
- `Max-Age=0` tells the browser to delete the cookie immediately
- The user is redirected to `/`

---

## Token Storage and Refresh

AuthSnap automatically stores OAuth tokens (access token, refresh token, expiry) in a `TokenStore` keyed by `{provider}:{userId}`. This enables:

### Accessing Tokens Later

```js
// Get stored tokens for a user
const key = TokenStore.key('google', user.id);
const tokens = await auth.tokenStore.get(key);
// tokens.accessToken, tokens.refreshToken, tokens.expiresAt
```

### Automatic Token Refresh

The `TokenRefresher` automatically handles expired tokens:

```js
// Returns valid tokens — refreshes automatically if expired
const tokens = await auth.tokenRefresher.getValidTokens('google', userId);

// Force a refresh even if not expired
const fresh = await auth.tokenRefresher.forceRefresh('google', userId);
```

When a token is refreshed:
1. The new tokens are stored in the `TokenStore`
2. The `onTokenRefresh` callback fires
3. If the provider doesn't issue a new refresh token, the old one is kept
4. If refresh fails, the invalid tokens are removed from the store

---

## Lifecycle Hooks — Deep Dive

Hooks let you plug into the authentication flow at key moments. All hooks are optional.

### onBeforeAuth

```js
onBeforeAuth: (provider, req) => { ... }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | `string` | Provider name (`'google'`, `'github'`) |
| `req` | `object` | The Express request object |

**When it fires:** Right before the user is redirected to the OAuth consent screen (step 2 in the flow).

**Use cases:**
- Log authentication attempts
- Track which providers users prefer
- Store the user's original URL (e.g. `req.query.returnTo`) for post-login redirect
- Rate limiting or abuse detection

```js
onBeforeAuth: (provider, req) => {
  console.log(`Auth attempt: ${provider} from ${req.ip}`);
},
```

### onSuccess

```js
onSuccess: async (user, tokens, provider) => { return { redirect: '/dashboard' }; }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `user` | `AuthUser` | The unified user profile |
| `tokens` | `TokenSet` | OAuth tokens (`accessToken`, `refreshToken`, `expiresAt`, `tokenType`, `scope`) |
| `provider` | `string` | Provider name |
| **Returns** | `{ redirect?: string }` | Where to send the user after login |

**When it fires:** After the code exchange and profile fetch succeed — right before the JWT session is created (step 14 in the flow).

**This is the most important hook.** It's where you:
- Save or update the user in your database
- Link OAuth accounts to existing users
- Store OAuth tokens for later API calls
- Set up the post-login redirect

```js
onSuccess: async (user, tokens, provider) => {
  // Upsert user in database
  await db.users.upsert({
    where: { email: user.email },
    create: {
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      provider: user.provider,
    },
    update: { name: user.name, avatar: user.avatar },
  });

  // Store tokens if you need to call provider APIs later
  await db.tokens.upsert({
    where: { userId: user.id, provider },
    create: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
    update: { accessToken: tokens.accessToken },
  });

  return { redirect: '/dashboard' };
},
```

**TokenSet shape:**

| Field | Type | Description |
|-------|------|-------------|
| `accessToken` | `string` | OAuth access token — use this to call the provider's API |
| `refreshToken` | `string \| null` | Refresh token (Google provides this; GitHub does not) |
| `expiresAt` | `number \| null` | Token expiry as Unix timestamp in milliseconds |
| `tokenType` | `string` | Usually `'Bearer'` |
| `scope` | `string \| null` | Granted scopes (space-separated) |

### onError

```js
onError: (error, provider) => { return { redirect: '/login?error=failed' }; }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `error` | `Error` | The error that occurred |
| `provider` | `string` | Provider name |
| **Returns** | `{ redirect?: string }` | Where to send the user after failure |

**When it fires:** When anything goes wrong during the callback handling — CSRF mismatch, token exchange failure, profile fetch failure, etc.

**Use cases:**
- Log errors for debugging
- Show user-friendly error pages
- Alert on suspicious activity (e.g. CSRF failures)

```js
onError: (error, provider) => {
  console.error(`Auth failed (${provider}):`, error.message);

  if (error.message.includes('CSRF')) {
    return { redirect: '/login?error=security' };
  }
  return { redirect: '/login?error=auth_failed' };
},
```

If no `onError` hook is defined, the user is redirected to `/auth/error` (which returns a 401 JSON response).

### onTokenRefresh

```js
onTokenRefresh: (tokens, provider) => { ... }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `tokens` | `TokenSet` | The refreshed token set |
| `provider` | `string` | Provider name |

**When it fires:** When the `TokenRefresher` automatically refreshes an expired access token using the refresh token.

**Use case:** Update stored tokens in your database when AuthSnap refreshes them.

```js
onTokenRefresh: (tokens, provider) => {
  console.log(`Tokens refreshed for ${provider}`);
  // Update tokens in your database
},
```

---

## Route Protection Middleware

The `auth.protect()` method returns middleware that gates routes to authenticated users only.

### Basic Usage (returns 401 JSON)

```js
app.get('/api/me', auth.protect(), (req, res) => {
  res.json({ user: req.user });
});
// Unauthenticated → { "error": "Unauthorized" } with status 401
```

### With Redirect (for browser pages)

```js
app.get('/dashboard', auth.protect({ redirect: '/login' }), (req, res) => {
  res.send(`Welcome, ${req.user.name}!`);
});
// Unauthenticated → 302 redirect to /login
```

### What `protect()` Does Internally

1. Extracts the JWT from the `authsnap_session` cookie (works with or without `cookie-parser`)
2. Verifies the JWT signature, expiration, and issuer using `jose`
3. If valid → sets `req.user` to the `AuthUser` object and calls `next()`
4. If invalid/missing → returns 401 or redirects (based on options)

---

## Rate Limiting

Auth routes are rate-limited by default to prevent brute-force and OAuth abuse. Rate limiting applies to login routes (`/auth/{provider}`) only.

```js
const auth = new AuthSnap({
  // ... providers, session
  rateLimit: {
    windowMs: 60_000,  // Time window (default: 60 seconds)
    max: 10,           // Max requests per window per IP (default: 10)
  },
});
```

When the limit is exceeded, the client receives a `429 Too Many Requests` response.

**Disable rate limiting:**
```js
rateLimit: false
```

Rate limiting works identically across Express, Fastify, and Hono adapters.

---

## Security

### CSRF / State Protection

AuthSnap protects against **Cross-Site Request Forgery** attacks on the OAuth callback:

1. **Before redirect:** A 32-byte random token is generated using `crypto.randomBytes(32)` and stored in a short-lived cookie (`authsnap_state`, expires in 10 minutes)
2. **On callback:** The `state` query parameter returned by the provider is compared against the cookie value
3. **If they don't match:** The request is rejected with an error ("Invalid state parameter — possible CSRF attack")
4. **After validation:** The state cookie is immediately cleared

### Open Redirect Prevention

AuthSnap validates all redirect URLs after authentication to prevent open redirect attacks.

**Default behavior (no config):**
- Relative paths (`/dashboard`, `/login?error=true`) — always allowed
- Absolute URLs (`https://evil.com`) — blocked, falls back to `/`

**With `allowedRedirects`:**
```js
const auth = new AuthSnap({
  // ... providers, session
  allowedRedirects: ['https://myapp.com', 'https://staging.myapp.com'],
});
```

Now absolute URLs matching those origins are allowed:
- `https://myapp.com/dashboard` — allowed (origin matches)
- `https://evil.com/steal` — blocked (not in allowlist)
- `/dashboard` — always allowed (relative path)

---

## Pluggable Token Store

By default, AuthSnap uses an in-memory `TokenStore`. For production, you can provide your own store — any object with this interface:

```js
const redisStore = {
  async get(key) { /* return tokens or null */ },
  async set(key, tokens) { /* store tokens */ },
  async delete(key) { /* delete tokens, return boolean */ },
  async has(key) { /* return boolean */ },
  async isExpired(key) { /* return boolean */ },
};

const auth = new AuthSnap({
  // ... providers, session
  tokenStore: redisStore,
});
```

The key format is `{provider}:{userId}` (e.g. `google:123456`). The tokens object has the shape `{ accessToken, refreshToken, expiresAt, tokenType, scope }`.

---

## All Providers

### Google

**Setup:** [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth 2.0 Client ID

**Callback URL to register:** `http://localhost:3000/auth/google/callback`

**Special behavior:**
- `access_type=offline` — requests a **refresh token** (lets you call Google APIs after access token expires)
- `prompt=select_account consent` — always shows account picker + consent screen

**Unique data in `raw`:** `verified_email`, `hd` (Workspace domain), `locale`

### GitHub

**Setup:** [GitHub Developer Settings](https://github.com/settings/developers) → OAuth Apps → New OAuth App

**Callback URL to register:** `http://localhost:3000/auth/github/callback`

**Special behavior:**
- **Private email fallback** — if user's email is private, AuthSnap automatically calls `/user/emails` to fetch the primary email
- `prompt=select_account` — shows account picker
- `id` is converted from number to string

**Unique data in `raw`:** `login` (username), `public_repos`, `followers`, `company`, `bio`

### Discord

**Setup:** [Discord Developer Portal](https://discord.com/developers/applications) → OAuth2

**Callback URL to register:** `http://localhost:3000/auth/discord/callback`

**Special behavior:**
- `prompt=consent` — always shows consent screen
- Avatar URL is constructed from user ID + avatar hash (supports animated GIFs)
- Falls back to `global_name` → `username` for display name

**Unique data in `raw`:** `global_name`, `username`, `discriminator`, `verified`

### Twitter / X

**Setup:** [Twitter Developer Portal](https://developer.twitter.com/) → Projects & Apps → OAuth 2.0

**Callback URL to register:** `http://localhost:3000/auth/twitter/callback`

**Special behavior:**
- Uses **OAuth 2.0 + PKCE** (code challenge with plain method)
- Token exchange uses **HTTP Basic Auth** (base64 encoded clientId:clientSecret)
- Uses Twitter API v2 with `user.fields=profile_image_url`
- Does not provide email by default (requires elevated API access)

### Apple

**Setup:** [Apple Developer](https://developer.apple.com/) → Certificates, Identifiers & Profiles → Service IDs

**Special behavior:**
- Uses **OAuth 2.0 + OIDC** — profile comes from the **id_token JWT**, not a userinfo endpoint
- Callback is **POST** (`response_mode=form_post`), not GET
- User's name is only provided on the **first** authorization
- Client secret can be auto-generated as an ES256 JWT from `teamId`, `keyId`, and `privateKey`

**Config:**
```js
apple: {
  clientId: 'com.your.service.id',
  clientSecret: 'auto-generated or manual',
  // For auto-generated client secret:
  teamId: 'YOUR_TEAM_ID',
  keyId: 'YOUR_KEY_ID',
  privateKey: '-----BEGIN PRIVATE KEY-----\n...',
}
```

### Microsoft

**Setup:** [Azure Portal](https://portal.azure.com/) → App registrations → New registration

**Callback URL to register:** `http://localhost:3000/auth/microsoft/callback`

**Special behavior:**
- Uses **Microsoft Graph API** (`/v1.0/me`) for user profile
- Configurable **tenant** — controls who can sign in:
  - `'common'` (default) — any Microsoft account
  - `'consumers'` — personal Microsoft accounts only
  - `'organizations'` — work/school accounts only
  - Specific tenant ID — single organization only
- `prompt=select_account` — shows account picker
- `emailVerified` is always `true` (Microsoft verifies all accounts)

**Config:**
```js
microsoft: {
  clientId: 'xxx',
  clientSecret: 'xxx',
  tenant: 'common', // Optional — 'common', 'consumers', 'organizations', or tenant ID
}
```

---

## Custom Providers

You can add any OAuth 2.0 provider by extending `BaseProvider`:

```js
import { AuthSnap, BaseProvider } from 'auth-snap';

class LinkedInProvider extends BaseProvider {
  constructor(config) {
    super('linkedin', config, {
      authorization: 'https://www.linkedin.com/oauth/v2/authorization',
      token: 'https://www.linkedin.com/oauth/v2/accessToken',
      userinfo: 'https://api.linkedin.com/v2/me',
    }, ['r_liteprofile', 'r_emailaddress']); // default scopes
  }

  async getProfile(accessToken) {
    const raw = await this._apiGet(this.endpoints.userinfo, accessToken);
    return {
      id: raw.id,
      email: raw.email,
      name: `${raw.localizedFirstName} ${raw.localizedLastName}`,
      avatar: raw.profilePicture?.displayImage || null,
      provider: 'linkedin',
      emailVerified: true,
      raw,
    };
  }
}

const auth = new AuthSnap({
  providers: {
    linkedin: {
      provider: LinkedInProvider,  // Pass your class here
      clientId: 'xxx',
      clientSecret: 'xxx',
    },
    google: { clientId: 'xxx', clientSecret: 'xxx' }, // Mix with built-in providers
  },
  session: { secret: 'xxx' },
});
```

Your custom provider class must:
1. Extend `BaseProvider`
2. Call `super(name, config, endpoints, defaultScopes)` in the constructor
3. Override `getProfile(accessToken)` to return an `AuthUser` object

---

## Auto-Generated Routes

When you call `app.use(auth.express())`, these routes are registered automatically:

| Route | Method | Description |
|-------|--------|-------------|
| `/auth/{provider}` | GET | Initiates OAuth flow — redirects to provider's consent screen |
| `/auth/{provider}/callback` | GET | Handles provider's redirect — exchanges code, creates session |
| `/auth/logout` | GET | Clears the session cookie and redirects to `/` |
| `/auth/error` | GET | Fallback error page — returns `401 { error: 'Authentication failed' }` |

If you configured `google` and `github`, the actual routes are:
- `/auth/google`, `/auth/google/callback`
- `/auth/github`, `/auth/github/callback`
- `/auth/logout`, `/auth/error`

Change the prefix with `basePath`:
```js
const auth = new AuthSnap({ basePath: '/api/auth', ... });
// Routes become: /api/auth/google, /api/auth/google/callback, etc.
```

---

## Error Handling

AuthSnap provides a hierarchy of error classes, all extending `AuthSnapError`:

| Error Class | Code | HTTP Status | When It's Thrown |
|-------------|------|-------------|-----------------|
| `AuthSnapError` | varies | varies | Base class — not thrown directly |
| `ConfigError` | `CONFIG_ERROR` | 500 | Invalid configuration (missing clientId, missing secret, unknown provider) |
| `ProviderError` | `PROVIDER_ERROR` | 502 | Provider API failure (token exchange failed, profile fetch failed) |
| `TokenError` | `TOKEN_ERROR` | 401 | Token exchange issues |
| `SessionError` | `SESSION_ERROR` | 401 | JWT verification failure (invalid signature, expired, wrong issuer) |

All errors have:
- `message` — human-readable description
- `code` — machine-readable error code
- `statusCode` — suggested HTTP status code

```js
import { AuthSnapError, ConfigError, ProviderError } from 'auth-snap';

try {
  const auth = new AuthSnap(config);
} catch (err) {
  if (err instanceof ConfigError) {
    console.error('Bad config:', err.message);
  }
}
```

---

## API Reference — Key Classes

### `AuthSnap`

The main entry point.

| Method | Returns | Description |
|--------|---------|-------------|
| `new AuthSnap(config)` | `AuthSnap` | Create a new instance. Validates config, registers providers, initializes session manager |
| `.express()` | `express.Router` | Returns an Express router with all auth routes mounted |
| `.fastify()` | `Function` | Returns a Fastify plugin with all auth routes |
| `.hono()` | `Function` | Returns a function that creates a Hono sub-app — call with `auth.hono()(Hono)` |
| `.protect(options?)` | `Function` | Returns route protection middleware. Options: `{ redirect?: string }` |
| `.getProvider(name)` | `BaseProvider` | Get a registered provider instance by name |
| `.tokenStore` | `TokenStore` | The token store instance (default in-memory, or your custom store) |
| `.tokenRefresher` | `TokenRefresher` | The token refresher instance |
| `.sessionManager` | `SessionManager` | The session manager instance |

### `SessionManager`

JWT session management.

| Method | Returns | Description |
|--------|---------|-------------|
| `.createToken(user)` | `Promise<string>` | Create a signed JWT from an AuthUser object |
| `.verifyToken(token)` | `Promise<AuthUser>` | Verify a JWT and return the AuthUser payload |
| `.buildCookieHeader(token)` | `string` | Build a `Set-Cookie` header value for the session |
| `.buildClearCookieHeader()` | `string` | Build a `Set-Cookie` header that clears the session |
| `.getTokenFromRequest(req)` | `string \| null` | Extract the session token from a request's cookies |

### `TokenStore`

In-memory OAuth token storage. Implements the pluggable store interface.

| Method | Returns | Description |
|--------|---------|-------------|
| `TokenStore.key(provider, userId)` | `string` | Build a storage key (static method) |
| `.get(key)` | `Promise<TokenSet \| null>` | Retrieve tokens |
| `.set(key, tokens)` | `Promise<void>` | Store tokens |
| `.delete(key)` | `Promise<boolean>` | Delete tokens |
| `.has(key)` | `Promise<boolean>` | Check if tokens exist |
| `.isExpired(key)` | `Promise<boolean>` | Check if tokens are expired |
| `.size` | `number` | Number of stored token sets |

### `TokenRefresher`

Automatic token refresh.

| Method | Returns | Description |
|--------|---------|-------------|
| `.getValidTokens(provider, userId)` | `Promise<TokenSet \| null>` | Get tokens — auto-refreshes if expired |
| `.forceRefresh(provider, userId)` | `Promise<TokenSet \| null>` | Force a refresh even if not expired |

### `BaseProvider`

Abstract base class for OAuth providers. Extend this to add custom providers.

| Method | Returns | Description |
|--------|---------|-------------|
| `.getAuthorizationURL(callbackURL, state)` | `string` | Build the OAuth consent screen URL |
| `.exchangeCode(code, callbackURL)` | `Promise<TokenSet>` | Exchange authorization code for tokens |
| `.getProfile(accessToken)` | `Promise<AuthUser>` | Fetch and normalize user profile (must be overridden) |

### Standalone Exports

| Export | Description |
|--------|-------------|
| `createProtectMiddleware(sessionManager, options?)` | Create protect middleware without an AuthSnap instance |
| `createRateLimiter(options?)` | Create a standalone rate limiter: `{ check(key), reset(key), clear() }` |

---

## Running the Example

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Fill in your OAuth credentials in `.env` (only providers you want to test):
   ```
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   GITHUB_CLIENT_ID=your-github-client-id
   GITHUB_CLIENT_SECRET=your-github-client-secret
   SESSION_SECRET=a-strong-random-string
   ```

   The example auto-detects which providers have credentials and only registers those.

3. Run:
   ```bash
   npm run example          # Express
   npm run example:fastify  # Fastify
   ```

4. Open `http://localhost:3000` and click a login link.

---

## Running Tests

```bash
npm test           # Single run (113 tests)
npm run test:watch # Watch mode
```

Tests cover: config validation, all 6 providers, JWT lifecycle, token store/refresh, route handlers, redirect validation, rate limiting, custom providers, protect middleware, and class instantiation — all without needing real OAuth credentials.

---

## License

MIT
