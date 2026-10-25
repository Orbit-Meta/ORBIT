import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ quiet: true });

function env(name, fallback = '') {
  return (process.env[name] ?? fallback).trim();
}

/** Throws a readable error listing every missing variable, so setup problems are obvious. */
export function requireEnv(...names) {
  const missing = names.filter((n) => !env(n));
  if (missing.length) {
    throw new Error(`Missing in .env: ${missing.join(', ')} (see .env.example)`);
  }
}

export const config = {
  discord: {
    token: env('DISCORD_TOKEN'),
    clientId: env('DISCORD_CLIENT_ID'),
    guildId: env('DISCORD_GUILD_ID'),
    recapChannelId: env('DISCORD_RECAP_CHANNEL_ID'),
  },
  muse: {
    apiKey: env('MODEL_API_KEY'),
    baseUrl: env('MUSE_BASE_URL', 'https://api.meta.ai/v1'),
    sparkModel: env('MUSE_SPARK_MODEL', 'muse-spark-1.3'),
    transcribeModel: env('MUSE_TRANSCRIBE_MODEL', 'muse-voice-transcribe-1.0'),
  },
  google: {
    clientId: env('GOOGLE_CLIENT_ID'),
    clientSecret: env('GOOGLE_CLIENT_SECRET'),
    calendarId: env('GOOGLE_CALENDAR_ID', 'primary'),
    refreshToken: env('GOOGLE_REFRESH_TOKEN'),
  },
  timezone: env('TIMEZONE', 'America/New_York'),
  defaultArea: env('DEFAULT_AREA', 'Downtown'),
  dmEveryone: env('DM_EVERYONE', 'true') === 'true',
  dashboardPort: Number(env('DASHBOARD_PORT', '3000')),
  voiceDebug: env('ORBIT_VOICE_DEBUG') === '1',
  dataDir: path.resolve(env('ORBIT_DATA_DIR', 'data')),
};
