// /start: the signup flow. Each ad links here with ?for=<ad> so the page opens on
// the problem that ad named. The visitor answers one question and sees a project
// outline written by AI (POST /api/outline, worker/outline.js). They can email
// it to themselves (POST /api/save), then book a call on Thomas's real calendar
// (GET /api/slots, POST /api/book). Each part switches on only once its account
// is connected (GET /api/config); until then the page offers email and phone
// instead. If the AI can't answer, the outline comes from the templates in
// outlines.js, so there's always an outline. On a translated page
// (/es/start and so on) every word comes from the strings the page carries
// (scripts/i18n.mjs writes them in), and the outline is written in its language.
import { OUTLINES as ENGLISH_OUTLINES, adFor, localize, pickKind as kindOf } from './outlines.js?v=14';
import { languageFor, translate } from './languages.js?v=14';

const $ = id => document.getElementById(id);
const LANG = languageFor(document.documentElement.dataset.lang);
const STRINGS = (() => {
  try { return JSON.parse($('siteStrings')?.textContent || '{}'); } catch (e) { return {}; }
})();
const t = (text, vars) => translate(STRINGS, text, vars);
const OUTLINES = localize(ENGLISH_OUTLINES, STRINGS);
// This language's home page, for "See the work" links.
const HOME = LANG.code === 'en' ? '/' : `/${LANG.code}/`;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';
const params = new URLSearchParams(window.location.search);
const adKey = params.get('for');
const adPage = localize(adFor(adKey), STRINGS);
// Where the visitor came from, for the per-ad counts: the ad and its platform.
const from = { ad: adPage ? adKey : null, src: params.get('utm_source') };
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const visitorTimeZone = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; }
})();

const state = {
  config: {}, problem: '', kind: 'general', token: null, outlineTitle: '',
  email: '', emailed: false, lead: null, days: [], slots: [], slot: null, booked: null, done: false,
};
// The outline is kept in this tab (sessionStorage) until it's saved or the
// tab is closed, so a reload or a slip of the Back button doesn't lose it. It
// expires with its token (3 hours), after which saving wouldn't work anyway.
const KEPT_KEY = 'start-outline';
const KEPT_FOR_MS = 3 * 60 * 60 * 1000;

function keepOutline(outline, fromAI) {
  try {
    sessionStorage.setItem(KEPT_KEY, JSON.stringify({ at: Date.now(), lang: LANG.code, problem: state.problem, kind: state.kind, token: state.token, outline, fromAI }));
  } catch (e) { /* storage off: a reload starts over, as before */ }
}

function forgetOutline() {
  try { sessionStorage.removeItem(KEPT_KEY); } catch (e) { /* nothing kept */ }
}

function keptOutline() {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEPT_KEY) || 'null');
    const fresh = kept && typeof kept.at === 'number' && Date.now() - kept.at < KEPT_FOR_MS;
    // An outline from another language's page isn't brought back here.
    if (fresh && (kept.lang || 'en') === LANG.code && typeof kept.problem === 'string' && kept.outline && Object.hasOwn(OUTLINES, kept.outline.kind)) return kept;
  } catch (e) { /* unreadable: start over */ }
  forgetOutline();
  return null;
}

let outlineTimers = [];
// Bumped for each outline request, so a reply that arrives after the visitor
// has gone back is ignored.
let outlineRequest = 0;

const pickKind = text => kindOf(text, adPage ? adPage.kind : null);

async function postJson(path, body, timeout = 20000) {
  const response = await fetch(path, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  let data = {};
  try { data = await response.json(); } catch (e) { /* stays {} */ }
  return { ok: response.ok, status: response.status, data: data || {} };
}

function fillList(list, items) {
  list.replaceChildren(...items.map(text => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
}

function showError(el, field, message) {
  el.textContent = message;
  if (field) field.setAttribute('aria-invalid', message ? 'true' : 'false');
}

// A button that's working: disabled, with a short label saying what's happening.
function busy(button, isBusy, label) {
  if (isBusy) {
    button.dataset.label = button.innerHTML;
    button.textContent = label;
  } else if (button.dataset.label) {
    button.innerHTML = button.dataset.label;
    delete button.dataset.label;
  }
  button.disabled = isBusy;
}

// What's switched on, asked once. Anything but a clear answer means "nothing
// yet", so the page offers email and phone instead of a form that can't work.
const configReady = fetch('/api/config', { signal: AbortSignal.timeout(8000) })
  .then(r => (r.ok ? r.json() : {}))
  .catch(() => ({}))
  .then(config => {
    state.config = config && typeof config === 'object' ? config : {};
    if (state.config.turnstile) loadBotCheck(state.config.turnstile);
    return state.config;
  });

// One page view for the per-ad counts: which ad, which platform, nothing about who.
postJson('/api/event', from, 8000).catch(() => {});

// Cloudflare Turnstile, the bot check, once it's switched on. It runs out of
// sight and only draws a box to tick when it isn't sure.
const botCheck = { widget: null, token: null, failed: false, interactive: false, waiting: [] };
const TICK_THE_BOX = t('Tick the box above so I know you\'re not a bot.');

function botCheckDone(token) {
  botCheck.token = token;
  botCheck.waiting.splice(0).forEach(resolve => resolve());
}

function loadBotCheck(siteKey) {
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.onload = () => {
    try {
      botCheck.widget = window.turnstile.render('#botCheck', {
        sitekey: siteKey,
        action: 'outline',
        appearance: 'interaction-only',
        callback: token => botCheckDone(token),
        'expired-callback': () => { botCheck.token = null; },
        // Turnstile wants a tick from this visitor: say so if they're waiting.
        'before-interactive-callback': () => {
          botCheck.interactive = true;
          if (botCheck.waiting.length) $('outlineBusy').textContent = TICK_THE_BOX;
        },
        'after-interactive-callback': () => { botCheck.interactive = false; },
        'error-callback': () => { botCheck.failed = true; botCheckDone(null); },
      });
    } catch (e) {
      botCheck.failed = true;
      botCheckDone(null);
    }
  };
  script.onerror = () => { botCheck.failed = true; botCheckDone(null); };
  document.head.append(script);
}

// A bot-check token, waiting for one if it isn't ready (the visitor may have
// a box to tick). Each token works once, so the check restarts after use.
async function botCheckToken() {
  if (!state.config.turnstile) return null;
  if (!botCheck.token && !botCheck.failed) {
    const slow = setTimeout(() => {
      $('outlineBusy').textContent = botCheck.interactive ? TICK_THE_BOX : t('Checking you\'re not a bot…');
    }, 400);
    await new Promise(resolve => {
      botCheck.waiting.push(resolve);
      // Give up after 30 seconds, but not while the visitor has a box to tick.
      const giveUp = () => (botCheck.interactive ? setTimeout(giveUp, 30000) : resolve());
      setTimeout(giveUp, 30000);
    });
    clearTimeout(slow);
    $('outlineBusy').textContent = '';
  }
  const token = botCheck.token;
  botCheck.token = null;
  if (botCheck.widget !== null && window.turnstile) {
    try { window.turnstile.reset(botCheck.widget); } catch (e) { /* the next outline just waits for a new token */ }
  }
  return token;
}

// One place decides what's on screen for each step, so Back, "See my
// outline again" and "Pick a time after all" all land in the same state.
const STEPS = ['describe', 'outline', 'book', 'done'];
function render(step, { focus = true } = {}) {
  if (step !== 'describe') stopTalking();
  $('stepDescribe').hidden = step !== 'describe';
  $('stepOutline').hidden = step !== 'outline';
  $('stepBook').hidden = step !== 'book';
  $('stepDone').hidden = step !== 'done';
  const current = STEPS.indexOf(step);
  document.querySelectorAll('.start-progress li').forEach(li => {
    const i = STEPS.indexOf(li.dataset.step);
    li.classList.toggle('is-current', i === current);
    li.classList.toggle('is-done', i < current);
    if (i === current) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
  if (!focus) return;
  const target = { describe: $('problem'), outline: $('outlineTitle'), book: $('bookTitle'), done: $('doneTitle') }[step];
  target.focus({ preventScroll: true });
  (step === 'describe' ? $('stepDescribe') : target).scrollIntoView({ behavior: scrollBehavior, block: 'start' });
}

function go(step) {
  history.pushState({ step }, '');
  render(step);
}

window.addEventListener('popstate', e => {
  const step = e.state && e.state.step;
  // Leaving while the outline is still "loading": stop it, and forget the
  // answer so Forward can't open an empty outline.
  if (!$('outlineLoading').hidden) {
    outlineTimers.forEach(clearTimeout);
    outlineTimers = [];
    outlineRequest += 1;
    state.problem = '';
  }
  // Only return to steps that have something to show.
  if (step === 'outline' && state.problem) render('outline');
  else if (step === 'book' && state.problem && state.lead) render('book');
  else if (step === 'done' && state.problem && state.done) render('done');
  else render('describe');
});

// Step 1: the ad-matched opening. Listeners go on first, so the form is
// always handled here and never submitted to the server.
// Set by the voice button below, when the browser supports it.
let stopTalking = () => {};

$('describeForm').addEventListener('submit', async e => {
  e.preventDefault();
  stopTalking();
  const button = $('outlineButton');
  if (button.disabled) return;
  const problem = $('problem').value.trim();
  if (problem.length < 10) {
    showError($('problemError'), $('problem'), t('Add a sentence about the problem so the outline has something to work with.'));
    $('problem').focus();
    return;
  }
  showError($('problemError'), $('problem'), '');
  busy(button, true, t('One moment…'));
  let turnstile = null;
  try {
    await configReady;
    turnstile = await botCheckToken();
  } finally {
    busy(button, false);
  }
  state.problem = problem;
  state.kind = pickKind(problem);
  buildOutline(turnstile);
});

// "Talk instead": the browser's own speech recognition types what the visitor
// says into the box. Hidden where the browser can't do it (Firefox, for one) or
// where the page's Permissions-Policy blocks the microphone.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const micAllowed = !document.featurePolicy || document.featurePolicy.allowsFeature('microphone');
if (Recognition && micAllowed) {
  const button = $('talkButton');
  const status = $('talkStatus');
  let recognition = null;
  let before = '';
  let heard = '';

  const VOICE_ERRORS = {
    'not-allowed': t('The microphone is blocked. Allow it from the icon in your browser\'s address bar, or type instead.'),
    'service-not-allowed': t('The microphone is blocked. Allow it from the icon in your browser\'s address bar, or type instead.'),
    'no-speech': t('I didn\'t hear anything. Try again a little closer to your microphone.'),
    'audio-capture': t('No microphone was found. You can type instead.'),
    'network': t('Talking needs an internet connection. You can type instead.'),
  };

  const say = (text, isError = false) => {
    status.hidden = !text;
    status.textContent = text;
    status.classList.toggle('is-error', isError);
  };
  const setListening = on => {
    button.classList.toggle('is-listening', on);
    $('talkLabel').textContent = on ? t('Stop') : t('Talk instead');
  };

  button.hidden = false;
  $('problemInput').classList.add('has-voice');
  $('problemHint').textContent = t('Plain words are fine, typed or spoken. If you talk, your browser turns it into text and may use its maker\'s speech service to do it (Google, in Chrome).');

  stopTalking = () => { if (recognition) recognition.stop(); };

  button.addEventListener('click', () => {
    if (recognition) { stopTalking(); return; }
    const current = $('problem').value.trim();
    // Talking replaces the ad's example; anything the visitor wrote is kept.
    before = adPage && current === adPage.prefill ? '' : current;
    heard = '';
    recognition = new Recognition();
    // The page's language, or the browser's own variant of it (en-GB, es-MX).
    const browserLang = navigator.language || '';
    recognition.lang = browserLang.toLowerCase().startsWith(LANG.tag.slice(0, 2).toLowerCase()) ? browserLang : LANG.tag;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setListening(true);
      say(t('Listening… Explain it like you would to a friend, then tap Stop.'));
    };
    recognition.onresult = e => {
      heard = Array.from(e.results, r => r[0].transcript.trim()).filter(Boolean).join(' ');
      $('problem').value = [before, heard].filter(Boolean).join(' ');
      showError($('problemError'), $('problem'), '');
    };
    recognition.onerror = e => {
      if (e.error !== 'aborted') say(VOICE_ERRORS[e.error] || t('Talking isn\'t working in this browser right now. You can type instead.'), true);
    };
    recognition.onend = () => {
      recognition = null;
      setListening(false);
      if (heard) {
        say(t('Got it. Fix anything I misheard, then build your outline.'));
        const box = $('problem');
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      } else if (!status.classList.contains('is-error')) {
        say('');
      }
    };

    try {
      recognition.start();
    } catch (err) {
      recognition = null;
      say(t('Talking isn\'t working in this browser right now. You can type instead.'), true);
    }
  });
}

if (adPage) {
  $('startEyebrow').textContent = adPage.eyebrow;
  const accent = document.createElement('span');
  accent.className = 'grad-text';
  accent.textContent = adPage.title[1];
  $('startTitle').replaceChildren(adPage.title[0], accent);
  $('startSub').textContent = adPage.sub;
  $('problemLabel').textContent = adPage.label;
  $('problem').value = adPage.prefill;
}
// The step this history entry showed before a reload, read before it's reset.
const stepBeforeReload = history.state && history.state.step;
history.replaceState({ step: 'describe' }, '');

// Step 2: the outline. The server answers with the AI's outline or, if the AI
// can't, the matching template, plus a token that lets the visitor save it.
// If the server can't be reached at all, the page shows its own template.
async function fetchOutline(problem, turnstile) {
  try {
    const { ok, data } = await postJson('/api/outline', { problem, ad: from.ad, src: from.src, lang: LANG.code, turnstile }, 30000);
    if (!ok || !data.outline || !Object.hasOwn(OUTLINES, data.outline.kind)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function showOutline(outline, fromAI, { show = true } = {}) {
  state.outlineTitle = outline.title;
  $('outlineTitle').textContent = outline.title;
  $('outlineProblem').textContent = state.problem;
  $('outlineBuild').textContent = outline.build;
  fillList($('outlineSteps'), outline.steps);
  fillList($('outlineNeeds'), outline.needs);
  fillList($('outlineQuestions'), outline.questions);
  $('outlineMilestone').textContent = outline.milestone;
  $('outlineDraft').textContent = fromAI
    ? t('Written by AI from what you wrote, as a starting point. I read every outline, and we\'d sharpen it together on a call.')
    : t('A first draft from what you wrote. We\'d sharpen it together on a call.');

  // Past work always comes from the fixed text, never from the AI.
  const template = OUTLINES[outline.kind] || OUTLINES.general;
  $('outlineShippedHeading').textContent = template.shippedHeading;
  const link = document.createElement('a');
  link.href = `${HOME}#work`;
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'work-link';
  link.innerHTML = t('See the work <span aria-hidden="true">↗</span><span class="visually-hidden"> (opens in a new tab)</span>');
  $('outlineShipped').replaceChildren(template.shipped + ' ', link);

  // Saving needs the server's say-so (the token); without it, offer email and phone.
  const canSave = Boolean(state.config.save && state.token);
  $('saveLive').hidden = !canSave;
  $('saveOff').hidden = canSave;
  $('saveTitle').textContent = canSave ? t('Save your outline, then pick a time to talk') : t('Want to talk it through?');
  $('jumpToSave').firstChild.textContent = `${canSave ? t('Save it and pick a time to talk') : t('How to talk it through')} `;
  $('followUpField').hidden = !state.config.followUp;
  showError($('emailError'), $('email'), '');

  $('outlineLoading').hidden = true;
  $('outline').hidden = false;
  $('save').hidden = false;
  if (show) render('outline');
}

async function buildOutline(turnstile) {
  outlineTimers.forEach(clearTimeout);
  const request = ++outlineRequest;
  state.token = null;
  state.lead = null;
  state.done = false;
  $('outline').hidden = true;
  $('save').hidden = true;
  $('outlineLoading').hidden = false;
  $('loadingText').textContent = t('Reading what you wrote…');
  history.pushState({ step: 'outline' }, '');
  render('outline', { focus: false });
  $('outlineLoading').focus({ preventScroll: true });
  $('stepOutline').scrollIntoView({ behavior: scrollBehavior, block: 'start' });

  // Progress messages while the AI writes; the last one stays until it's done.
  const messages = [t('Reading what you wrote…'), t('Thinking about how I\'d build it…'), t('Writing your outline…'), t('Almost there…')];
  const pause = prefersReducedMotion ? 1500 : 1800;
  outlineTimers = messages.slice(1).map((text, i) => setTimeout(() => { $('loadingText').textContent = text; }, (i + 1) * pause));

  // A short minimum so the step doesn't flash past when the template answers instantly.
  const [reply] = await Promise.all([
    fetchOutline(state.problem, turnstile),
    new Promise(resolve => setTimeout(resolve, prefersReducedMotion ? 300 : 900)),
  ]);
  if (request !== outlineRequest) return;
  outlineTimers.forEach(clearTimeout);
  outlineTimers = [];
  if (reply) {
    state.kind = reply.outline.kind;
    state.token = typeof reply.token === 'string' ? reply.token : null;
    showOutline(reply.outline, reply.source === 'ai');
    keepOutline(reply.outline, reply.source === 'ai');
  } else {
    showOutline({ kind: state.kind, ...OUTLINES[state.kind] }, false);
    forgetOutline();
  }
}

// After a reload: the outline this tab already had, with the save form ready.
// The history entries from before the reload are still there, so this entry
// keeps its own step: reloading on the outline shows the outline again, and
// reloading on the question shows the question, with Forward still going to
// the outline. No entry is added, so each Back press still does something.
async function restoreOutline(kept, step) {
  state.problem = kept.problem;
  state.kind = kept.outline.kind;
  state.token = typeof kept.token === 'string' ? kept.token : null;
  $('problem').value = kept.problem;
  await configReady;
  const onOutline = step === 'outline';
  if (onOutline) history.replaceState({ step: 'outline' }, '');
  showOutline(kept.outline, kept.fromAI === true, { show: onOutline });
}

$('editProblem').addEventListener('click', () => go('describe'));

$('jumpToSave').addEventListener('click', () => {
  $('saveTitle').focus({ preventScroll: true });
  $('saveTitle').scrollIntoView({ behavior: scrollBehavior, block: 'start' });
});

// Saving: the outline is emailed to the visitor, and Thomas gets a copy.
const SAVE_ERRORS = {
  bad_email: t('That email doesn\'t look right. Check it and try again.'),
  expired: t('This outline has been open a while. Choose "Change what I wrote" above and build it again to save it.'),
  too_many_sends: t('It\'s already been sent a few times. Check your inbox and spam folder.'),
  inbox_limit: t('That address has already been sent a few outlines today. Try again tomorrow, or email t@thomasewright.com.'),
  rate_limited: t('Too many tries. Wait a minute, then try again.'),
};

$('saveForm').addEventListener('submit', async e => {
  e.preventDefault();
  const button = $('saveButton');
  if (button.disabled) return;
  const email = $('email').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    showError($('emailError'), $('email'), SAVE_ERRORS.bad_email);
    $('email').focus();
    return;
  }
  showError($('emailError'), $('email'), '');
  busy(button, true, t('Sending…'));
  let result = null;
  try {
    result = await postJson('/api/save', { token: state.token, email, followUp: $('followUp').checked, timeZone: visitorTimeZone });
  } catch (err) {
    result = null;
  } finally {
    busy(button, false);
  }
  if (!result || !result.ok || !result.data.ok) {
    const code = result && (result.status === 429 && !result.data.error ? 'rate_limited' : result.data.error);
    showError($('emailError'), $('email'), (code && Object.hasOwn(SAVE_ERRORS, code) && SAVE_ERRORS[code]) || t('Your outline couldn\'t be sent just now. Try again, or email t@thomasewright.com.'));
    $('email').focus();
    return;
  }
  forgetOutline();
  state.email = email;
  state.emailed = result.data.emailed !== false;
  state.lead = typeof result.data.lead === 'string' ? result.data.lead : null;
  const note = state.emailed
    ? t('Sent to {email}. If it isn\'t in your inbox in a few minutes, check your spam folder.', { email })
    : t('Saved. The email didn\'t go through, but Thomas has your details and will reply to {email}.', { email });
  if (state.config.book && state.lead) goToBooking(note);
  else finish(false, note);
});

// Step 3: booking, from Thomas's real open times.
const dayKey = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
// Dates and times in the page's language (the browser's own on the English page).
const LOCALE = LANG.code === 'en' ? undefined : LANG.tag;
const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', month: 'short', day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });

// The zone's name on that date, so a slot after a clock change gets the right label.
function zoneName(date) {
  try {
    const part = new Intl.DateTimeFormat(LOCALE, { timeZoneName: 'long' })
      .formatToParts(date).find(p => p.type === 'timeZoneName');
    return part ? part.value : '';
  } catch (e) { return ''; }
}

function chip(name, value, text) {
  const label = document.createElement('label');
  label.className = 'chip';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  const span = document.createElement('span');
  span.textContent = text;
  label.append(input, span);
  return label;
}

function calLink(text) {
  const link = document.createElement('a');
  link.href = state.config.bookLink;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = text;
  const note = document.createElement('span');
  note.className = 'visually-hidden';
  note.textContent = ` ${t('(opens in a new tab)')}`;
  link.append(note);
  return link;
}

function timesUnavailable(message) {
  $('timesLoading').hidden = true;
  $('bookForm').hidden = true;
  const box = $('timesUnavailable');
  box.hidden = false;
  box.replaceChildren(message + ' ');
  if (state.config.bookLink) box.append(calLink(t('Pick a time on Cal.com')), ` ${t('or reply to your outline email.')}`);
  else box.append(t('Reply to your outline email and we\'ll find a time.'));
}

// Open times, grouped into the visitor's own days.
async function loadTimes() {
  $('timesLoading').hidden = false;
  $('timesUnavailable').hidden = true;
  $('bookForm').hidden = true;
  let times = null;
  try {
    const response = await fetch('/api/slots', { signal: AbortSignal.timeout(15000) });
    if (response.ok) times = (await response.json()).times;
  } catch (e) { /* handled below */ }
  if (!Array.isArray(times)) {
    timesUnavailable(t('Open times couldn\'t be loaded just now.'));
    return;
  }
  const days = new Map();
  for (const time of times) {
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey.format(date);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(date);
  }
  state.days = [...days.values()].slice(0, 10);
  if (!state.days.length) {
    timesUnavailable(t('There are no open times in the next three weeks.'));
    return;
  }
  $('bookDays').replaceChildren(...state.days.map((slots, i) => chip('day', String(i), dayFormat.format(slots[0]))));
  $('timesGroup').hidden = true;
  state.slot = null;
  updateBookButton();
  $('timesLoading').hidden = true;
  $('bookForm').hidden = false;
}

function renderTimes(dayIndex) {
  const slots = state.days[dayIndex];
  $('bookTimes').replaceChildren(...slots.map((slot, i) => chip('time', String(i), timeFormat.format(slot))));
  state.slots = slots;
  const zone = zoneName(slots[0]);
  $('timesLegend').textContent = zone ? t('Time ({zone})', { zone }) : t('Time');
  $('timesGroup').hidden = false;
  state.slot = null;
  updateBookButton();
}

function updateBookButton() {
  $('bookButton').textContent = state.slot
    ? t('Book {day} at {time}', { day: dayFormat.format(state.slot), time: timeFormat.format(state.slot) })
    : t('Book the call');
}

$('bookDays').addEventListener('change', e => {
  showError($('bookError'), null, '');
  renderTimes(Number(e.target.value));
});

$('bookTimes').addEventListener('change', e => {
  showError($('bookError'), null, '');
  state.slot = state.slots[Number(e.target.value)];
  updateBookButton();
});

function goToBooking(sentMessage) {
  $('sentNote').textContent = sentMessage;
  go('book');
  loadTimes();
}

$('backToOutline').addEventListener('click', () => history.back());

function bookingFallback() {
  if (!state.config.bookLink || $('bookForm').querySelector('.book-fallback')) return;
  const p = document.createElement('p');
  p.className = 'start-hint book-fallback';
  p.append(calLink(t('Pick a time on Cal.com instead')));
  $('bookError').after(p);
}

$('bookForm').addEventListener('submit', async e => {
  e.preventDefault();
  const button = $('bookButton');
  if (button.disabled) return;
  if (!state.slot) {
    showError($('bookError'), null, $('timesGroup').hidden ? t('Pick a day first.') : t('Pick a time that works.'));
    return;
  }
  const name = $('name').value.trim();
  if (!name) {
    showError($('bookError'), $('name'), t('Add your name so Thomas knows who\'s on the call.'));
    $('name').focus();
    return;
  }
  showError($('bookError'), $('name'), '');
  busy(button, true, t('Booking…'));
  let result = null;
  try {
    result = await postJson('/api/book', { lead: state.lead, start: state.slot.toISOString(), name, timeZone: visitorTimeZone }, 25000);
  } catch (err) {
    result = null;
  }
  busy(button, false);
  updateBookButton();
  if (result && result.ok) {
    state.booked = new Date(result.data.start || state.slot);
    finish(true);
    return;
  }
  const error = result && result.data.error;
  if (error === 'already_booked') {
    state.booked = null;
    finish(true);
    return;
  }
  if (error === 'taken') {
    // The form is hidden while the times reload, so focus waits on the heading,
    // then goes to the first day with the message beside it.
    $('bookTitle').focus({ preventScroll: true });
    await loadTimes();
    if (!$('bookForm').hidden) {
      showError($('bookError'), null, t('Someone just took that time. Pick another.'));
      $('bookDays').querySelector('input').focus();
    }
    return;
  }
  if (error === 'unconfirmed') {
    // The calendar may have booked it without saying so: trying again here
    // could book twice, so the visitor checks their inbox first.
    showError($('bookError'), null, t('The calendar didn\'t confirm the booking. If an invite from Cal.com doesn\'t reach {email} in a few minutes, pick a time on Cal.com instead.', { email: state.email }));
    bookingFallback();
    return;
  }
  const expired = error === 'expired' || error === 'gone';
  showError($('bookError'), null, expired
    ? t('This page has been open a while, so the call can\'t be booked from here. Reply to your outline email instead.')
    : t('The call couldn\'t be booked just now. Try again in a moment.'));
  bookingFallback();
});

$('skipBooking').addEventListener('click', () => finish(false, $('sentNote').textContent));
$('bookAfterAll').addEventListener('click', () => {
  go('book');
  loadTimes();
});

function finish(booked, note = '') {
  state.done = true;
  $('bookAfterAll').hidden = booked || !(state.config.book && state.lead);
  if (booked) {
    $('doneTitle').textContent = t('You\'re booked.');
    if (state.booked) {
      const zone = zoneName(state.booked);
      const when = { day: dayFormat.format(state.booked), time: timeFormat.format(state.booked), zone };
      $('doneText').textContent = zone ? t('{day} at {time}, {zone}.', when) : t('{day} at {time}.', when);
    } else {
      $('doneText').textContent = t('Your call is already on the calendar.');
    }
    fillList($('doneNext'), [
      t('Cal.com is sending the calendar invite to {email}, with links to reschedule or cancel.', { email: state.email }),
      state.emailed
        ? t('Your outline is in a separate email. Reply to it to add anything you forgot.')
        : t('Thomas has your outline and will go through it with you on the call.'),
    ]);
  } else {
    $('doneTitle').textContent = state.emailed ? t('Your outline is on its way.') : t('Your outline is saved.');
    $('doneText').textContent = note;
    fillList($('doneNext'), [
      state.config.bookLink
        ? t('When you\'re ready to talk, reply to the email or use the link in it to pick a time.')
        : t('When you\'re ready to talk, reply to the email and we\'ll find a time.'),
    ]);
  }
  go('done');
}

// A reload (or coming back with the browser's Back button) brings back the
// outline this tab already had. Opening /start afresh, say from another ad,
// starts a new one.
const navigation = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {};
const kept = ['reload', 'back_forward'].includes(navigation.type) ? keptOutline() : null;
if (kept) restoreOutline(kept, stepBeforeReload);
