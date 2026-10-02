// What's switched on. Each part of /start turns on by itself once its account
// is connected (docs/SIGNUP-SETUP.md), so nothing breaks in between:
//   saving   needs the leads database (DB) and Resend (RESEND_API_KEY)
//   booking  needs saving and a Cal.com event link (CAL_LINK)
//   follow-up email needs saving and a postal address (POSTAL_ADDRESS)
//   bot check needs both Turnstile keys (TURNSTILE_SITE_KEY, TURNSTILE_SECRET)
//   phone alerts need an ntfy topic (NTFY_TOPIC)
//   the leads list needs the database and a 16+ character ADMIN_PASSWORD
import { clean, timeZoneOrNull } from './http.js';

export const SITE_URL = 'https://wright-ai-solutions.com';

export const settings = env => ({
  siteUrl: env.SITE_URL || SITE_URL,
  from: env.EMAIL_FROM || 'Thomas Wright <thomas@wright-ai-solutions.com>',
  replyTo: env.REPLY_TO || 't@thomasewright.com',
  leadsTo: env.LEADS_TO || 't@thomasewright.com',
  // Thomas's own time zone, for phone alerts and the daily counts.
  ownerTz: timeZoneOrNull(env.OWNER_TZ) || 'America/Denver',
  postalAddress: clean(env.POSTAL_ADDRESS || ''),
  // AI outlines a day (UTC) before visitors get the templates instead.
  aiDailyLimit: /^\d+$/.test(String(env.AI_DAILY_LIMIT ?? '')) ? Number(env.AI_DAILY_LIMIT) : 300,
});

// A Cal.com event link such as https://cal.com/thomas/intro-call, split into
// the username and event slug the API wants. Anything else means "off".
export function calEvent(env) {
  if (typeof env.CAL_LINK !== 'string') return null;
  try {
    const url = new URL(env.CAL_LINK);
    const [username, slug, ...rest] = url.pathname.split('/').filter(Boolean);
    const part = /^[A-Za-z0-9_.-]{1,64}$/;
    if (url.protocol !== 'https:' || !/^(app\.)?cal\.com$/.test(url.hostname) || rest.length || !part.test(username || '') || !part.test(slug || '')) {
      return null;
    }
    return { username, slug, link: `https://cal.com/${username}/${slug}` };
  } catch {
    return null;
  }
}

export function features(env) {
  const cal = calEvent(env);
  const save = Boolean(env.DB && env.RESEND_API_KEY);
  return {
    save,
    book: save && Boolean(cal),
    followUp: save && Boolean(settings(env).postalAddress),
    turnstile: env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET ? String(env.TURNSTILE_SITE_KEY) : null,
    admin: Boolean(env.DB) && typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length >= 16,
    cal,
  };
}
