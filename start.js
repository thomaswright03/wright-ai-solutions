// /start: the signup flow. Each ad links here with ?for=<ad> so the page opens on
// the problem that ad named. The visitor answers one question, sees a project
// outline, says where to send it, then books a call. This prototype keeps
// everything in the browser: nothing is sent or stored.

// Wrapped so its names don't clash with script.js, which shares the page's global scope.
(() => {
  // Ad-matched openings. The key is the ?for= value in the ad's link.
  const AD_PAGES = {
    leads: {
      eyebrow: 'For businesses losing leads',
      title: ['Stop losing leads ', 'after hours.'],
      sub: 'Tell me how leads reach you today. You\'ll get an outline for an agent that replies to new leads fast, even after hours.',
      label: 'Is this your problem? Edit it or add details.',
      prefill: 'Leads come in by text, web form or phone while we\'re busy or closed, and by the time someone replies they\'ve gone somewhere else.',
      kind: 'leads',
    },
    spreadsheets: {
      eyebrow: 'For teams buried in spreadsheets',
      title: ['Stop copying data ', 'by hand.'],
      sub: 'Tell me where the data lives and where it needs to end up. You\'ll get an outline for a pipeline that moves it for you.',
      label: 'Is this your problem? Edit it or add details.',
      prefill: 'Someone on our team spends hours every week copying data between spreadsheets, websites and our other tools.',
      kind: 'data',
    },
    support: {
      eyebrow: 'For businesses answering the same questions',
      title: ['Answer the same customer questions ', 'once.'],
      sub: 'Tell me what customers keep asking. You\'ll get an outline for an assistant that answers them and hands the unusual ones to you.',
      label: 'Is this your problem? Edit it or add details.',
      prefill: 'Customers email and text us the same questions over and over, and answering them takes up a big part of someone\'s day.',
      kind: 'support',
    },
    app: {
      eyebrow: 'For founders with an app idea',
      title: ['Get your app idea ', 'in front of real users.'],
      sub: 'Tell me what the app should do and who it\'s for. You\'ll get an outline for a first version you can put in people\'s hands.',
      label: 'What should it do? Edit this or start fresh.',
      prefill: 'I have an idea for an app or web platform and need someone to design, build and launch the first version.',
      kind: 'app',
    },
  };

  // Outline templates, one per kind of work the studio does. "shipped" only
  // repeats what index.html already says about each project.
  const OUTLINES = {
    leads: {
      title: 'An AI agent that answers your leads',
      build: 'An AI agent that replies to new leads by text soon after they arrive, including after hours, in your business\'s voice. It answers the simple questions, asks the ones you\'d ask, and hands the conversation to your team the moment someone steps in.',
      steps: [
        'A lead arrives from your website, an ad or your CRM.',
        'The agent replies and keeps the conversation going.',
        'It passes the lead to you when they\'re ready to book or buy.',
        'As soon as someone on your team replies, it steps back for good.',
      ],
      needs: [
        'Access to where leads land today, such as your CRM or form tool',
        'A few real replies you\'ve sent that you liked',
        'The questions you always ask a new lead, and anything it must never promise',
        'Your texting consent and opt-out wording, so it never texts anyone who has opted out',
      ],
      milestone: 'The agent replying to a handful of real leads while you watch every message, before it runs on its own.',
      shippedHeading: 'Something similar I\'ve built',
      shipped: 'AI Lead Response Agent: a text-message agent that follows up with inbound leads from a CRM on a schedule and stops the moment a person takes over.',
      questions: [
        'Where do leads come in today, and who answers them?',
        'What usually happens to a lead nobody gets to?',
        'What should the agent never say?',
      ],
    },
    data: {
      title: 'A pipeline that moves your data for you',
      build: 'An automated pipeline that pulls the data from wherever it lives, cleans and matches it, and puts it where your team works, on a schedule, with nobody copying and pasting.',
      steps: [
        'It collects the data from each source on a schedule.',
        'It cleans, de-duplicates and matches the records.',
        'It updates your spreadsheet, dashboard or CRM.',
        'Anything it can\'t match is flagged for a person to check.',
      ],
      needs: [
        'A list of the sources and where the data should end up',
        'Logins or API access for each system',
        'One example of a finished report or record, so we agree on what "done" looks like',
      ],
      milestone: 'One source flowing into one destination automatically, checked against a week of your real data.',
      shippedHeading: 'Something similar I\'ve built',
      shipped: 'Data→Lead→Sell: a platform I built and run that cross-references obituaries with county property records and puts matched leads on a live map, a job that used to take hours of manual digging.',
      questions: [
        'Which part of the copying takes the longest today?',
        'How often does the data need to be up to date?',
        'Who checks the result, and what do they fix most often?',
      ],
    },
    support: {
      title: 'An assistant that answers the repeat questions',
      build: 'An AI assistant that answers your customers\' common questions from your own policies and past replies, in your tone, and passes anything unusual or sensitive to a person with the conversation so far.',
      steps: [
        'A customer asks a question by email, text or chat.',
        'The assistant answers from information you\'ve approved.',
        'Anything it isn\'t sure of goes straight to your team.',
        'You review its answers and it improves from your edits.',
      ],
      needs: [
        'Your most common questions and how you answer them',
        'Any policies, price lists or documents it should rely on',
        'Access to the inbox or channel the questions arrive in',
      ],
      milestone: 'The assistant drafting answers to your top questions for you to approve, before it replies to anyone on its own.',
      shippedHeading: 'The closest thing I\'ve built',
      shipped: 'AI Lead Response Agent: a text-message agent that holds a conversation in context and steps back the moment a person from the business replies.',
      questions: [
        'What are the five questions you answer most?',
        'Which questions must always go to a person?',
        'Where do the questions come in today?',
      ],
    },
    app: {
      title: 'A first version of your app',
      build: 'A first version of your app with only the features the first users need, deployed on the web and ready to use, then improved from what those users actually do.',
      steps: [
        'We agree on the one thing the first version must do well.',
        'I design and build it, showing you working pieces as I go.',
        'It launches to a small group of real users.',
        'We improve it from their feedback before adding more.',
      ],
      needs: [
        'Who the first users are and how you\'ll reach them',
        'Any sketches, examples or apps you like the feel of',
        'The one feature you\'d keep if you could only have one',
      ],
      milestone: 'A clickable version of the one core feature that you can put in front of a few real users.',
      shippedHeading: 'Something similar I\'ve built',
      shipped: 'ParkLess, a parking marketplace in beta where drivers find and book spots on a live map, and a portfolio site for an independent artist with a searchable gallery.',
      questions: [
        'Who is the first person who would pay for or use this?',
        'What do they use instead today?',
        'What does a successful first month look like to you?',
      ],
    },
    general: {
      title: 'A custom tool built around your problem',
      build: 'A custom tool or automation shaped around the problem you described. On the call we\'d narrow it to the smallest version that fixes it, so you see results before a bigger build.',
      steps: [
        'We map how the work happens today, step by step.',
        'We pick the step that costs the most time or money.',
        'I build a working fix for that step first.',
        'We extend it once the first part is earning its keep.',
      ],
      needs: [
        'A walk-through of how the work happens today',
        'Access to the tools involved',
        'Someone on your side who can answer questions as I build',
      ],
      milestone: 'A working fix for the single most expensive step, running on your real work.',
      shippedHeading: 'Work I\'ve built',
      shipped: 'An AI agent that follows up with leads, a data platform that finds real-estate leads in public records, and websites for a marketplace and an artist.',
      questions: [
        'What happens today, step by step?',
        'What would change if this problem went away tomorrow?',
        'Who else is affected by it?',
      ],
    },
  };

  // Whole-word patterns that point to each kind of work, for visitors who
  // didn't come from a matched ad (and to overrule the ad when the text is clear).
  const SIGNALS = {
    leads: [/\bleads?\b/, /\binquir/, /\benquir/, /\bprospects?\b/, /\bfollow[- ]?ups?\b/, /\bmiss(ed|ing)?( the| our)? (calls?|them)\b/, /\bvoicemails?\b/, /\bcall(ing)? back\b/, /\bcrm\b/, /\bgohighlevel\b/, /\bhubspot\b/, /\bquote requests?\b/, /\bappointment requests?\b/, /\bbook(ing)? (a |an )?(call|appointment|consult)/],
    data: [/\bspreadsheets?\b/, /\bexcel\b/, /\bgoogle sheets?\b/, /\bcop(y|ying|ied)\b/, /\bpast(e|ing)\b/, /\bdata entry\b/, /\bentering data\b/, /\bre-?(enter|type)/, /\breports?\b/, /\bcsv\b/, /\bexports?\b/, /\bimport(s|ed|ing)?\b/, /\bsync/, /\brecords\b/, /\bby hand\b/, /\bmanually\b/, /\binvoices?\b/, /\bquickbooks\b/, /\bshopify\b/],
    support: [/\bcustomer questions?\b/, /\bsame questions?\b/, /\bquestions\b/, /\bsupport\b/, /\bfaqs?\b/, /\binbox\b/, /\btickets?\b/, /\bcustomer service\b/, /\banswering\b/],
    app: [/\bapps?\b/, /\bwebsite\b/, /\bweb ?site\b/, /\bplatform\b/, /\bmarketplace\b/, /\bportal\b/, /\bmvp\b/, /\blaunch\b/, /\bstartup\b/, /\bidea for\b/],
  };

  const $ = id => document.getElementById(id);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';
  const params = new URLSearchParams(window.location.search);
  const adKey = params.get('for');
  // hasOwn so ?for=constructor or ?for=__proto__ fall back to the plain page.
  const adPage = adKey && Object.hasOwn(AD_PAGES, adKey) ? AD_PAGES[adKey] : null;

  const state = { problem: '', kind: 'general', email: '', provider: '', slot: null, days: [], slots: [] };
  let outlineTimers = [];

  function pickKind(text) {
    const lower = text.toLowerCase();
    const scores = Object.fromEntries(Object.entries(SIGNALS).map(([kind, patterns]) =>
      [kind, patterns.filter(re => re.test(lower)).length]));
    // The ad only breaks ties; clear words in the visitor's own text win.
    if (adPage) scores[adPage.kind] += 0.5;
    const [best, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return score >= 1 ? best : (adPage ? adPage.kind : 'general');
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

  // One place decides what's on screen for each step, so Back, "See my
  // outline again" and "Pick a time after all" all land in the same state.
  const STEPS = ['describe', 'outline', 'book', 'done'];
  function render(step, { focus = true } = {}) {
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
    if (outlineTimers.length && !$('outlineLoading').hidden) {
      outlineTimers.forEach(clearTimeout);
      outlineTimers = [];
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
  $('describeForm').addEventListener('submit', e => {
    e.preventDefault();
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

  // Step 2: the outline. The live version would ask an AI model to write it.
  function buildOutline() {
    outlineTimers.forEach(clearTimeout);
    const outline = OUTLINES[state.kind];
    $('outline').hidden = true;
    $('save').hidden = true;
    $('outlineLoading').hidden = false;
    history.pushState({ step: 'outline' }, '');
    render('outline', { focus: false });
    $('outlineLoading').focus({ preventScroll: true });
    $('stepOutline').scrollIntoView({ behavior: scrollBehavior, block: 'start' });

    const messages = ['Reading what you wrote…', 'Matching it to work I\'ve built…', 'Drafting your outline…'];
    const pause = prefersReducedMotion ? 300 : 550;
    outlineTimers = messages.map((text, i) => setTimeout(() => { $('loadingText').textContent = text; }, i * pause));

    outlineTimers.push(setTimeout(() => {
      $('outlineTitle').textContent = outline.title;
      $('outlineProblem').textContent = state.problem;
      $('outlineBuild').textContent = outline.build;
      fillList($('outlineSteps'), outline.steps);
      fillList($('outlineNeeds'), outline.needs);
      fillList($('outlineQuestions'), outline.questions);
      $('outlineMilestone').textContent = outline.milestone;
      $('outlineShippedHeading').textContent = outline.shippedHeading;

      const link = document.createElement('a');
      link.href = '/#work';
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'work-link';
      link.innerHTML = 'See the work <span aria-hidden="true">↗</span><span class="visually-hidden"> (opens in a new tab)</span>';
      $('outlineShipped').replaceChildren(outline.shipped + ' ', link);

      outlineTimers = [];
      $('outlineLoading').hidden = true;
      $('outline').hidden = false;
      $('save').hidden = false;
      render('outline');
    }, messages.length * pause));
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
