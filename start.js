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
      sub: 'Tell me how leads reach you today. You\'ll get an outline for an agent that answers every one of them, then you can pick a time to talk it through.',
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

  // Outline templates, one per kind of work the studio does.
  const OUTLINES = {
    leads: {
      title: 'An AI agent that answers every lead',
      build: 'An AI agent that replies to each new lead by text as soon as it arrives, day or night, in your business\'s voice. It answers the simple questions, asks the ones you\'d ask, and hands the conversation to your team the moment someone steps in.',
      steps: [
        'A lead arrives from your website, an ad or a missed call.',
        'The agent replies right away and keeps the conversation going.',
        'It books the lead on your calendar or flags them for you.',
        'As soon as someone on your team replies, it steps back for good.',
      ],
      needs: [
        'Access to where leads land today, such as your CRM, form tool or phone system',
        'A few real replies you\'ve sent that you liked',
        'The questions you always ask a new lead, and anything it must never promise',
      ],
      shipped: 'AI Lead Response Agent: a text-message agent that follows up with leads from a CRM on its own and stops the moment a person takes over.',
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
      shipped: 'Data→Lead→Sell: a pipeline I built and run that matches public records across county websites and turns them into leads on a live map, with no manual digging.',
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
        'The assistant answers from your approved information.',
        'Anything it isn\'t sure of goes straight to your team.',
        'You review its answers and it improves from your edits.',
      ],
      needs: [
        'Your most common questions and how you answer them',
        'Any policies, price lists or documents it should rely on',
        'Access to the inbox or channel the questions arrive in',
      ],
      shipped: 'AI Lead Response Agent: a text-message agent that holds a conversation in context and hands over to a person the moment one steps in.',
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
      shipped: 'ParkLess, a marketplace where drivers find and book parking on a live map, and Studio McKenna, an artist\'s portfolio with a searchable gallery.',
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
      shipped: 'AI agents, data pipelines and web apps, all shown on the home page.',
      questions: [
        'What happens today, step by step?',
        'What would change if this problem went away tomorrow?',
        'Who else is affected by it?',
      ],
    },
  };

  // Words that point to each kind of work, for visitors who didn't come from a matched ad.
  const SIGNALS = {
    leads: ['lead', 'inquir', 'enquir', 'prospect', 'follow up', 'follow-up', 'missed call', 'text back', 'crm', 'gohighlevel', 'hubspot', 'quote request', 'sales'],
    data: ['spreadsheet', 'excel', 'google sheet', 'copy', 'paste', 'data entry', 'report', 'csv', 'export', 'import', 'sync', 'records', 'by hand', 'manually'],
    support: ['customer question', 'same question', 'questions', 'support', 'faq', 'inbox', 'ticket', 'customer service', 'answering'],
    app: ['app', 'website', 'web site', 'platform', 'marketplace', 'portal', 'dashboard', 'mvp', 'launch', 'startup'],
  };

  const $ = id => document.getElementById(id);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(window.location.search);
  const adPage = AD_PAGES[params.get('for')] || null;

  const state = { problem: '', team: '', kind: 'general', email: '', slot: null };

  function pickKind(text) {
    const lower = text.toLowerCase();
    const scores = Object.fromEntries(Object.entries(SIGNALS).map(([kind, words]) =>
      [kind, words.filter(w => lower.includes(w)).length]));
    if (adPage) scores[adPage.kind] += 1;
    const [best, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return score > 0 ? best : 'general';
  }

  function showStep(section) {
    section.hidden = false;
    const heading = section.querySelector('[tabindex="-1"]');
    if (heading) {
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function setProgress(step) {
    const order = ['describe', 'outline', 'book'];
    document.querySelectorAll('.start-progress li').forEach(li => {
      const i = order.indexOf(li.dataset.step);
      const current = order.indexOf(step);
      li.classList.toggle('is-current', i === current);
      li.classList.toggle('is-done', i < current);
      if (i === current) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
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

  // Step 1: the ad-matched opening.
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
    state.team = new FormData(e.target).get('team') || '';
    state.kind = pickKind(problem);
    buildOutline();
  });

  // Step 2: the outline. The live version would ask an AI model to write it.
  function buildOutline() {
    const outline = OUTLINES[state.kind];
    $('stepDescribe').hidden = true;
    $('outline').hidden = true;
    $('save').hidden = true;
    $('outlineLoading').hidden = false;
    setProgress('outline');
    $('stepOutline').hidden = false;
    $('stepOutline').scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });

    const messages = ['Reading what you wrote…', 'Matching it to work I\'ve shipped…', 'Drafting your outline…'];
    const pause = prefersReducedMotion ? 300 : 550;
    messages.forEach((text, i) => setTimeout(() => { $('loadingText').textContent = text; }, i * pause));

    setTimeout(() => {
      $('outlineTitle').textContent = outline.title;
      $('outlineProblem').textContent = state.problem;
      $('outlineTeam').hidden = !state.team;
      $('outlineTeam').textContent = state.team ? `Affects ${state.team}.` : '';
      $('outlineBuild').textContent = outline.build;
      fillList($('outlineSteps'), outline.steps);
      fillList($('outlineNeeds'), outline.needs);
      fillList($('outlineQuestions'), outline.questions);

      const shipped = $('outlineShipped');
      const link = document.createElement('a');
      link.href = '/#work';
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'work-link';
      link.innerHTML = 'See the work <span aria-hidden="true">↗</span><span class="visually-hidden"> (opens in a new tab)</span>';
      shipped.replaceChildren(outline.shipped + ' ', link);

      $('outlineLoading').hidden = true;
      $('outline').hidden = false;
      $('save').hidden = false;
      showStep($('outline'));
    }, messages.length * pause);
  }

  $('editProblem').addEventListener('click', () => {
    $('stepOutline').hidden = true;
    setProgress('describe');
    $('stepDescribe').hidden = false;
    $('problem').focus();
    $('stepDescribe').scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  });

  // Where to send it: one tap, or an email address.
  document.querySelectorAll('.save-provider').forEach(button => {
    button.addEventListener('click', () => {
      state.email = '';
      goToBooking(`Your outline is on its way to your ${button.dataset.provider} email.`);
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
    goToBooking(`Your outline is on its way to ${email}.`);
  });

  // Step 3: booking. The live version would read Thomas's real calendar.
  const tz = (() => {
    try {
      const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'long' })
        .formatToParts(new Date()).find(p => p.type === 'timeZoneName');
      return part ? part.value : '';
    } catch (e) { return ''; }
  })();
  const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const SLOT_TIMES = [[9, 0], [9, 30], [10, 30], [11, 0], [13, 0], [14, 0], [15, 30], [16, 0]];

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

  const days = nextWeekdays(10);

  function renderDays() {
    $('bookDays').replaceChildren(...days.map((day, i) => chip('day', String(i), dayFormat.format(day))));
  }

  function renderTimes(dayIndex) {
    const slots = openSlots(days[dayIndex], dayIndex);
    $('bookTimes').replaceChildren(...slots.map(slot => chip('time', slot.toISOString(), timeFormat.format(slot))));
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
    state.slot = new Date(e.target.value);
    updateBookButton();
  });

  function goToBooking(sentMessage) {
    $('sentNote').textContent = sentMessage;
    $('tzName').textContent = tz ? ` (${tz})` : '';
    renderDays();
    $('timesGroup').hidden = true;
    state.slot = null;
    updateBookButton();
    $('stepOutline').hidden = true;
    setProgress('book');
    showStep($('stepBook'));
  }

  $('bookForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!state.slot) {
      showError($('bookError'), null, $('timesGroup').hidden ? 'Pick a day first.' : 'Pick a time that works.');
      return;
    }
    finish(true);
  });

  $('skipBooking').addEventListener('click', () => finish(false));

  function icsFor(start) {
    const end = new Date(start.getTime() + 15 * 60 * 1000);
    const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const text = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wright AI Solutions LLC//Start a project//EN',
      'BEGIN:VEVENT',
      `UID:${stamp(start)}-start@wright-ai-solutions.com`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      'SUMMARY:15-minute call with Thomas Wright (Wright AI Solutions)',
      'DESCRIPTION:Talking through your project outline.',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    return URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  }

  function finish(booked) {
    const where = state.email || 'your email';
    $('stepBook').hidden = true;
    $('icsLink').hidden = !booked;
    if (booked) {
      $('doneTitle').textContent = 'You\'re booked.';
      $('doneText').textContent = `${dayFormat.format(state.slot)} at ${timeFormat.format(state.slot)}${tz ? `, ${tz}` : ''}. Thomas gets a text the moment you book, so he'll have read your outline before you talk.`;
      fillList($('doneNext'), [
        `A calendar invite with the call link is on its way to ${where}.`,
        'Your outline is in the same email. Reply to it to add anything you forgot.',
        'Need a different time? Use the link in the invite.',
      ]);
      $('icsLink').href = icsFor(state.slot);
    } else {
      $('doneTitle').textContent = 'Your outline is on its way.';
      $('doneText').textContent = 'Read it when you have a minute. When you\'re ready to talk, reply to the email or come back here to book a time.';
      fillList($('doneNext'), ['Reply to the email to add anything you forgot.']);
    }
    showStep($('stepDone'));
  }
})();
