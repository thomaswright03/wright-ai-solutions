// /start: the signup flow. Each ad links here with ?for=<ad> so the page opens on
// the problem that ad named. The visitor answers one question, sees a project
// outline written by AI (POST /api/outline, worker/index.js), says where to send
// it, then books a call. If the AI can't answer, the outline comes from the
// templates in outlines.js. Saving and booking are still prototypes: nothing is sent.

import { OUTLINES, adFor, pickKind as kindOf } from './outlines.js?v=8';

// Wrapped so its names don't clash with script.js, which shares the page's global scope.
(() => {
  const $ = id => document.getElementById(id);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';
  const params = new URLSearchParams(window.location.search);
  const adKey = params.get('for');
  const adPage = adFor(adKey);

  const state = { problem: '', kind: 'general', email: '', provider: '', slot: null, days: [], slots: [] };
  let outlineTimers = [];
  // Bumped for each outline request, so a reply that arrives after the visitor
  // has gone back is ignored.
  let outlineRequest = 0;

  const pickKind = text => kindOf(text, adPage ? adPage.kind : null);

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
    else if (step === 'book' && state.problem) render('book');
    else if (step === 'done' && state.problem) render('done');
    else render('describe');
  });

  // Step 1: the ad-matched opening. Listeners go on first, so the form is
  // always handled here and never submitted to the server.
  // Set by the voice button below, when the browser supports it.
  let stopTalking = () => {};

  $('describeForm').addEventListener('submit', e => {
    e.preventDefault();
    stopTalking();
    const problem = $('problem').value.trim();
    if (problem.length < 10) {
      showError($('problemError'), $('problem'), 'Add a sentence about the problem so the outline has something to work with.');
      $('problem').focus();
      return;
    }
    showError($('problemError'), $('problem'), '');
    state.problem = problem;
    state.kind = pickKind(problem);
    buildOutline();
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
      'not-allowed': 'The microphone is blocked. Allow it from the icon in your browser\'s address bar, or type instead.',
      'service-not-allowed': 'The microphone is blocked. Allow it from the icon in your browser\'s address bar, or type instead.',
      'no-speech': 'I didn\'t hear anything. Try again a little closer to your microphone.',
      'audio-capture': 'No microphone was found. You can type instead.',
      'network': 'Talking needs an internet connection. You can type instead.',
    };

    const say = (text, isError = false) => {
      status.hidden = !text;
      status.textContent = text;
      status.classList.toggle('is-error', isError);
    };
    const setListening = on => {
      button.classList.toggle('is-listening', on);
      $('talkLabel').textContent = on ? 'Stop' : 'Talk instead';
    };

    button.hidden = false;
    $('problemInput').classList.add('has-voice');
    $('problemHint').textContent = 'Plain words are fine, typed or spoken. If you talk, your browser turns it into text and may use its maker\'s speech service to do it (Google, in Chrome).';

    stopTalking = () => { if (recognition) recognition.stop(); };

    button.addEventListener('click', () => {
      if (recognition) { stopTalking(); return; }
      const current = $('problem').value.trim();
      // Talking replaces the ad's example; anything the visitor wrote is kept.
      before = adPage && current === adPage.prefill ? '' : current;
      heard = '';
      recognition = new Recognition();
      recognition.lang = navigator.language || 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setListening(true);
        say('Listening… Explain it like you would to a friend, then tap Stop.');
      };
      recognition.onresult = e => {
        heard = Array.from(e.results, r => r[0].transcript.trim()).filter(Boolean).join(' ');
        $('problem').value = [before, heard].filter(Boolean).join(' ');
        showError($('problemError'), $('problem'), '');
      };
      recognition.onerror = e => {
        if (e.error !== 'aborted') say(VOICE_ERRORS[e.error] || 'Talking isn\'t working in this browser right now. You can type instead.', true);
      };
      recognition.onend = () => {
        recognition = null;
        setListening(false);
        if (heard) {
          say('Got it. Fix anything I misheard, then build your outline.');
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
        say('Talking isn\'t working in this browser right now. You can type instead.', true);
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
  history.replaceState({ step: 'describe' }, '');

  // Step 2: the outline, written by AI from the visitor's own words. Any
  // failure (offline, rate limited, out of quota, a bad reply) quietly uses the
  // matching template instead, so there's always an outline.
  async function fetchOutline(problem) {
    try {
      const response = await fetch('/api/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem, hint: adPage ? adPage.kind : null }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data && data.source === 'ai' && data.outline && OUTLINES[data.outline.kind] ? data.outline : null;
    } catch (e) {
      return null;
    }
  }

  function showOutline(outline, fromAI) {
    $('outlineTitle').textContent = outline.title;
    $('outlineProblem').textContent = state.problem;
    $('outlineBuild').textContent = outline.build;
    fillList($('outlineSteps'), outline.steps);
    fillList($('outlineNeeds'), outline.needs);
    fillList($('outlineQuestions'), outline.questions);
    $('outlineMilestone').textContent = outline.milestone;
    $('outlineDraft').textContent = fromAI
      ? 'Written by AI from what you wrote, as a starting point. Thomas reads every outline and we\'d sharpen it together on a call.'
      : 'A first draft from what you wrote. We\'d sharpen it together on a call.';

    // Past work always comes from the fixed text, never from the AI.
    const template = OUTLINES[outline.kind] || OUTLINES.general;
    $('outlineShippedHeading').textContent = template.shippedHeading;
    const link = document.createElement('a');
    link.href = '/#work';
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'work-link';
    link.innerHTML = 'See the work <span aria-hidden="true">↗</span><span class="visually-hidden"> (opens in a new tab)</span>';
    $('outlineShipped').replaceChildren(template.shipped + ' ', link);

    $('outlineLoading').hidden = true;
    $('outline').hidden = false;
    $('save').hidden = false;
    render('outline');
  }

  async function buildOutline() {
    outlineTimers.forEach(clearTimeout);
    const request = ++outlineRequest;
    $('outline').hidden = true;
    $('save').hidden = true;
    $('outlineLoading').hidden = false;
    $('loadingText').textContent = 'Reading what you wrote…';
    history.pushState({ step: 'outline' }, '');
    render('outline', { focus: false });
    $('outlineLoading').focus({ preventScroll: true });
    $('stepOutline').scrollIntoView({ behavior: scrollBehavior, block: 'start' });

    // Progress messages while the AI writes; the last one stays until it's done.
    const messages = ['Reading what you wrote…', 'Thinking about how I\'d build it…', 'Writing your outline…', 'Almost there…'];
    const pause = prefersReducedMotion ? 1500 : 1800;
    outlineTimers = messages.slice(1).map((text, i) => setTimeout(() => { $('loadingText').textContent = text; }, (i + 1) * pause));

    // A short minimum so the step doesn't flash past when the template answers instantly.
    const [aiOutline] = await Promise.all([
      fetchOutline(state.problem),
      new Promise(resolve => setTimeout(resolve, prefersReducedMotion ? 300 : 900)),
    ]);
    if (request !== outlineRequest) return;
    outlineTimers.forEach(clearTimeout);
    outlineTimers = [];
    if (aiOutline) {
      state.kind = aiOutline.kind;
      showOutline(aiOutline, true);
    } else {
      showOutline(OUTLINES[state.kind], false);
    }
  }

  $('editProblem').addEventListener('click', () => go('describe'));

  $('jumpToSave').addEventListener('click', () => {
    $('saveTitle').focus({ preventScroll: true });
    $('saveTitle').scrollIntoView({ behavior: scrollBehavior, block: 'start' });
  });

  // Where to send it: one tap, or an email address.
  document.querySelectorAll('.save-provider').forEach(button => {
    button.addEventListener('click', () => {
      state.email = '';
      state.provider = button.dataset.provider;
      goToBooking(`Saved. Your outline will go to your ${button.dataset.provider} email.`);
    });
  });

  $('saveForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError($('emailError'), $('email'), 'That email doesn\'t look right. Check it and try again.');
      $('email').focus();
      return;
    }
    showError($('emailError'), $('email'), '');
    state.email = email;
    state.provider = '';
    goToBooking(`Saved. Your outline will go to ${email}.`);
  });

  // Step 3: booking. The live version would read Thomas's real calendar.
  const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const SLOT_TIMES = [[9, 0], [9, 30], [10, 30], [11, 0], [13, 0], [14, 0], [15, 30], [16, 0]];

  // The zone's name on that date, so a slot after a clock change gets the right label.
  function zoneName(date) {
    try {
      const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'long' })
        .formatToParts(date).find(p => p.type === 'timeZoneName');
      return part ? part.value : '';
    } catch (e) { return ''; }
  }

  function nextWeekdays(count) {
    const days = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    while (days.length < count) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) days.push(new Date(d));
    }
    return days;
  }

  // A fixed pattern of open slots so the prototype looks like a real calendar.
  function openSlots(day, dayIndex) {
    return SLOT_TIMES.filter((_, i) => (dayIndex * 3 + i) % 4 !== 0).map(([h, m]) => {
      const slot = new Date(day);
      slot.setHours(h, m, 0, 0);
      return slot;
    });
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

  function renderTimes(dayIndex) {
    const slots = openSlots(state.days[dayIndex], dayIndex);
    $('bookTimes').replaceChildren(...slots.map((slot, i) => chip('time', String(i), timeFormat.format(slot))));
    state.slots = slots;
    const zone = zoneName(slots[0]);
    $('timesLegend').textContent = zone ? `Time (${zone})` : 'Time';
    $('timesGroup').hidden = false;
    state.slot = null;
    updateBookButton();
  }

  function updateBookButton() {
    $('bookButton').textContent = state.slot
      ? `Book ${dayFormat.format(state.slot)} at ${timeFormat.format(state.slot)}`
      : 'Book the call';
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
    // Built when the step opens, so a tab left open overnight never offers past days.
    state.days = nextWeekdays(10);
    $('bookDays').replaceChildren(...state.days.map((day, i) => chip('day', String(i), dayFormat.format(day))));
    $('timesGroup').hidden = true;
    state.slot = null;
    updateBookButton();
    go('book');
  }

  $('backToOutline').addEventListener('click', () => history.back());

  $('bookForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!state.slot) {
      showError($('bookError'), null, $('timesGroup').hidden ? 'Pick a day first.' : 'Pick a time that works.');
      return;
    }
    finish(true);
  });

  $('skipBooking').addEventListener('click', () => finish(false));
  $('bookAfterAll').addEventListener('click', () => go('book'));

  function icsFor(start) {
    const end = new Date(start.getTime() + 15 * 60 * 1000);
    const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const uid = `${stamp(start)}-${Math.random().toString(36).slice(2, 10)}@wright-ai-solutions.com`;
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wright AI Solutions LLC//Start a project//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      'SUMMARY:Prototype (not booked): 15-minute call with Thomas Wright',
      'DESCRIPTION:This came from a prototype page. No call was booked. To talk for real\\, email t@thomasewright.com or call (801) 580-8630.',
      'END:VEVENT', 'END:VCALENDAR',
    ];
    return URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar' }));
  }

  function finish(booked) {
    const where = state.email || (state.provider ? `your ${state.provider} email` : 'your email');
    $('icsLink').hidden = !booked;
    $('bookAfterAll').hidden = booked;
    if (booked) {
      const zone = zoneName(state.slot);
      $('doneTitle').textContent = 'You\'re booked.';
      $('doneText').textContent = `${dayFormat.format(state.slot)} at ${timeFormat.format(state.slot)}${zone ? `, ${zone}` : ''}. Thomas gets your outline by text the moment you book.`;
      fillList($('doneNext'), [
        `A calendar invite with the call details goes to ${where}.`,
        'Your outline is in the same email. Reply to it to add anything you forgot.',
        'Need a different time? Use the link in the invite.',
      ]);
      if ($('icsLink').dataset.url) URL.revokeObjectURL($('icsLink').dataset.url);
      $('icsLink').href = $('icsLink').dataset.url = icsFor(state.slot);
    } else {
      $('doneTitle').textContent = 'Your outline is on its way.';
      $('doneText').textContent = 'Read it when you have a minute. When you\'re ready to talk, reply to the email and we\'ll find a time.';
      fillList($('doneNext'), [`It goes to ${where}.`, 'Reply to the email to add anything you forgot.']);
    }
    go('done');
  }
})();
