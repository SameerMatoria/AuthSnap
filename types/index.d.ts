// AuthSnap — TypeScript declarations

// ── Shared types ──────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  provider: string;
  emailVerified: boolean;
  raw: Record<string, any>;
  roles?: string[];
  permissions?: string[];
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  tokenType: string;
  scope: string | null;
}

export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  callbackURL?: string;
  prompt?: string;
  /** Custom provider class (must extend BaseProvider) */
  provider?: typeof BaseProvider;
  [key: string]: any;
}

export interface SessionConfig {
  strategy?: 'jwt';
  secret: string;
  maxAge?: number;
  cookieName?: string;
  secure?: boolean;
}

export interface AuthCallbacks {
  onSuccess?(user: AuthUser, tokens: TokenSet, provider: string): Promise<{ redirect?: string; roles?: string[]; permissions?: string[] } | void> | { redirect?: string; roles?: string[]; permissions?: string[] } | void;
  onError?(error: Error, provider: string): { redirect?: string } | void;
  onBeforeAuth?(provider: string, req: any): void;
  onTokenRefresh?(tokens: TokenSet, provider: string): void;
}

export interface RateLimitConfig {
  windowMs?: number;
  max?: number;
}

export interface AuthSnapConfig {
  providers: Record<string, ProviderConfig>;
  session?: SessionConfig;
  callbacks?: AuthCallbacks;
  basePath?: string;
  baseURL?: string;
  tokenStore?: TokenStore;
  rateLimit?: RateLimitConfig | false;
  allowedRedirects?: string[];
}

// ── Core ──────────────────────────────────────────────────────

export interface AuthSnapEvents {
  login: { provider: string; req: any };
  success: { user: AuthUser; tokens: TokenSet; provider: string };
  error: { error: Error; provider: string };
  logout: {};
  'token:refresh': { tokens: TokenSet; provider: string };
}

export class AuthSnap {
  config: AuthSnapConfig;
  providers: Map<string, BaseProvider>;
  sessionManager: SessionManager;
  tokenStore: TokenStore;
  tokenRefresher: TokenRefresher;

  constructor(config: AuthSnapConfig);

  getProvider(name: string): BaseProvider;

  /** Returns an Express Router with all auth routes */
  express(): any;

  /** Returns a Fastify plugin with all auth routes */
  fastify(): any;

  /** Returns a function that creates a Hono sub-app with auth routes */
  hono(): (Hono: any) => any;

  /** Returns route protection middleware */
  protect(options?: ProtectOptions): any;

  /** Subscribe to an event */
  on<K extends keyof AuthSnapEvents>(event: K, listener: (data: AuthSnapEvents[K]) => void): this;
  on(event: string, listener: (data: any) => void): this;

  /** Subscribe to an event once */
  once<K extends keyof AuthSnapEvents>(event: K, listener: (data: AuthSnapEvents[K]) => void): this;
  once(event: string, listener: (data: any) => void): this;

  /** Unsubscribe from an event */
  off<K extends keyof AuthSnapEvents>(event: K, listener: (data: AuthSnapEvents[K]) => void): this;
  off(event: string, listener: (data: any) => void): this;

  /** Emit an event (safe — listener errors are caught) */
  emit<K extends keyof AuthSnapEvents>(event: K, data: AuthSnapEvents[K]): void;
  emit(event: string, data: any): void;
}

// ── Errors ────────────────────────────────────────────────────

export class AuthSnapError extends Error {
  code: string;
  statusCode: number;
  constructor(message: string, code: string, statusCode?: number);
}

export class ConfigError extends AuthSnapError {
  constructor(message: string);
}

export class ProviderError extends AuthSnapError {
  provider: string;
  constructor(message: string, provider: string);
}

export class TokenError extends AuthSnapError {
  constructor(message: string);
}

export class SessionError extends AuthSnapError {
  constructor(message: string);
}

// ── Providers ─────────────────────────────────────────────────

export class BaseProvider {
  name: string;
  config: ProviderConfig;
  endpoints: { authorization: string; token: string; userinfo: string };
  scopes: string[];

  constructor(name: string, config: ProviderConfig, endpoints: { authorization: string; token: string; userinfo: string }, defaultScopes?: string[]);

  getAuthorizationURL(callbackURL: string, state: string): string;
  exchangeCode(code: string, callbackURL: string): Promise<TokenSet>;
  getProfile(accessToken: string, extra?: any): Promise<AuthUser>;
}

export class GoogleProvider extends BaseProvider {
  constructor(config: ProviderConfig);
}

export class GitHubProvider extends BaseProvider {
  constructor(config: ProviderConfig);
}

export class DiscordProvider extends BaseProvider {
  constructor(config: ProviderConfig);
}

export class TwitterProvider extends BaseProvider {
  constructor(config: ProviderConfig);
}

export class AppleProvider extends BaseProvider {
  constructor(config: ProviderConfig);
}

export class MicrosoftProvider extends BaseProvider {
  constructor(config: ProviderConfig);
}

export class LinkedInProvider extends BaseProvider {
  constructor(config: ProviderConfig);
}

export class SpotifyProvider extends BaseProvider {
  constructor(config: ProviderConfig);
}

// ── Session ───────────────────────────────────────────────────

export class SessionManager {
  config: SessionConfig;
  cookieName: string;
  maxAge: number;
  secure: boolean;

  constructor(config: SessionConfig);

  createToken(user: AuthUser, extra?: { roles?: string[]; permissions?: string[] }): Promise<string>;
  verifyToken(token: string): Promise<AuthUser>;
  buildCookieHeader(token: string): string;
  getTokenFromRequest(req: any): string | null;
  buildClearCookieHeader(): string;
}

export class TokenStore {
  static key(provider: string, userId: string): string;

  set(key: string, tokens: TokenSet): Promise<void>;
  get(key: string): Promise<TokenSet | null>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  isExpired(key: string): Promise<boolean>;
  clear(): Promise<void>;
  readonly size: number;
}

export class TokenRefresher {
  constructor(authSnap: AuthSnap);

  getValidTokens(providerName: string, userId: string): Promise<TokenSet | null>;
  forceRefresh(providerName: string, userId: string): Promise<TokenSet | null>;
}

// ── Middleware ─────────────────────────────────────────────────

export interface ProtectOptions {
  redirect?: string;
  roles?: string[];
  permissions?: string[];
  forbiddenRedirect?: string;
}

export function createProtectMiddleware(
  sessionManager: SessionManager,
  options?: ProtectOptions
): (req: any, res: any, next: any) => Promise<void>;

export interface RateLimiter {
  check(key: string): boolean;
  reset(key: string): void;
  clear(): void;
}

export function createRateLimiter(options?: RateLimitConfig): RateLimiter;

// ── Account Linking ────────────────────────────────────────────

export interface AccountLinkStore {
  link(userId: string, provider: string, providerId: string): Promise<void>;
  unlink(userId: string, provider: string): Promise<boolean>;
  getLinkedAccounts(userId: string): Promise<Record<string, string>>;
  findByProvider(provider: string, providerId: string): Promise<string | null>;
  isLinked(userId: string, provider: string): Promise<boolean>;
}

export class AccountLinker {
  store: AccountLinkStore;

  constructor(store?: AccountLinkStore);

  link(userId: string, provider: string, providerId: string): Promise<void>;
  unlink(userId: string, provider: string): Promise<boolean>;
  getLinkedAccounts(userId: string): Promise<Record<string, string>>;
  findByProvider(provider: string, providerId: string): Promise<string | null>;
  isLinked(userId: string, provider: string): Promise<boolean>;
}
