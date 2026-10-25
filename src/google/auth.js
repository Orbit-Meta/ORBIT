// Google OAuth for the organizer account (Desktop-app client, loopback redirect + PKCE).
import crypto from 'node:crypto';
import path from 'node:path';
import { config } from '../config.js';
import { readJson, writeJson } from '../store/jsonFile.js';

export const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email'];
const TOKEN_FILE = path.join(config.dataDir, 'google-token.json');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** .env wins if set; otherwise the token saved by `npm run google:auth`. */
export function storedToken() {
  if (config.google.refreshToken) return { refresh_token: config.google.refreshToken, email: '(from .env)' };
  return readJson(TOKEN_FILE, null);
}

export function isCalendarConnected() {
  return Boolean(config.google.clientId && config.google.clientSecret && storedToken()?.refresh_token);
}

export function buildAuthRequest(redirectUri) {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline', // we need a refresh token
    prompt: 'consent', // always return one, even on re-auth
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();
  return { url: url.toString(), verifier, state };
}

/** Swap the one-time code for tokens and save the refresh token. Returns the account email. */
export async function exchangeCode({ code, verifier, redirectUri }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${json.error_description ?? json.error}`);
  if (!json.refresh_token) throw new Error('Google did not return a refresh token. Remove Orbit at https://myaccount.google.com/permissions and try again.');
  const email = json.id_token ? JSON.parse(Buffer.from(json.id_token.split('.')[1], 'base64url').toString()).email : 'unknown';
  writeJson(TOKEN_FILE, { refresh_token: json.refresh_token, email, scope: json.scope, obtainedAt: new Date().toISOString() });
  return { email, file: TOKEN_FILE };
}

let cached = null; // { token, expiresAt }

export async function accessToken() {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const stored = storedToken();
  if (!stored?.refresh_token) throw new Error('Google Calendar is not connected. Run `npm run google:auth`.');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: stored.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    if (json.error === 'invalid_grant') throw new Error('Google sign-in expired or was revoked (testing-mode apps expire after 7 days). Run `npm run google:auth` again.');
    throw new Error(`Google token refresh failed: ${json.error_description ?? json.error}`);
  }
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cached.token;
}
