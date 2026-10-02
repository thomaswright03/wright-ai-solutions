// The words behind /start, shared by the page (start.js) and the server
// (worker/index.js), so an outline the server sends by email is exactly the one
// the visitor saw. Plain data and one pure function: no DOM, no network.

// The kinds of work the studio does. Every outline has one.
export const KINDS = ['leads', 'data', 'support', 'app', 'website', 'general'];

// Ad-matched openings. The key is the ?for= value in the ad's link.
export const AD_PAGES = {
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
  'missed-calls': {
    eyebrow: 'For businesses missing calls',
    title: ['Text back the calls ', 'you can\'t pick up.'],
    sub: 'Tell me when calls get missed and what callers usually want. You\'ll get an outline for an agent that texts them back and hands the conversation to you.',
    label: 'Is this your problem? Edit it or add details.',
    prefill: 'We miss calls when we\'re with a customer or out on a job, and by the time we call back they\'ve already booked with someone else.',
    kind: 'leads',
  },
  reports: {
    eyebrow: 'For businesses building reports by hand',
    title: ['Get your weekly numbers ', 'without the copy and paste.'],
    sub: 'Tell me which numbers you check and where they come from. You\'ll get an outline for a report that pulls them together for you on a schedule.',
    label: 'Is this your problem? Edit it or add details.',
    prefill: 'Every Monday I copy numbers from our sales, payroll and accounting tools into a spreadsheet for our weekly report. It takes hours.',
    kind: 'data',
  },
  website: {
    eyebrow: 'For businesses with an out-of-date website',
    title: ['Get a website you can ', 'update yourself.'],
    sub: 'Tell me what your business does and what customers look for. You\'ll get an outline for a site you can change yourself, with a clear way for customers to reach you.',
    label: 'Is this your problem? Edit it or add details.',
    prefill: 'Our website is out of date and only the person who built it can change it. Customers can\'t easily find our services or contact us.',
    kind: 'website',
  },
  booking: {
    eyebrow: 'For businesses booking by phone and text',
    title: ['Let customers book ', 'without the back-and-forth.'],
    sub: 'Tell me how customers book with you today. You\'ll get an outline for an agent that replies to booking requests and helps customers find a time that works.',
    label: 'Is this your problem? Edit it or add details.',
    prefill: 'Customers text and call to book appointments, and it takes a lot of back and forth to find a time. Some give up and go elsewhere.',
    kind: 'leads',
  },
};

// Outline templates, one per kind of work the studio does. "shipped" only
// repeats what index.html already says about each project.
export const OUTLINES = {
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
  website: {
    title: 'A website you can update yourself',
    build: 'A clear website that shows what you do and makes it easy for customers to reach you, built so you can change the words and photos yourself without waiting on a developer.',
    steps: [
      'We agree on what customers come to your site to do.',
      'I design and build it, showing you working pages as I go.',
      'I show you how to change the words and photos yourself.',
      'It goes live on your domain, and we fix anything real visitors trip over.',
    ],
    needs: [
      'The words you use for your services, plus your logo and photos',
      'Access to your domain and your current site',
      'A few websites you like the look of',
    ],
    milestone: 'Your new home page on a preview link, with you making your first change to it yourself.',
    shippedHeading: 'Something similar I\'ve built',
    shipped: 'Studio McKenna, a portfolio site for an independent artist with a searchable gallery and an upload flow for adding new pieces straight from a phone.',
    questions: [
      'What do customers most often come to your site to do?',
      'What do you want to be able to change yourself, and how often?',
      'What does your current site get wrong today?',
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
export const SIGNALS = {
  leads: [/\bleads?\b/, /\binquir/, /\benquir/, /\bprospects?\b/, /\bfollow[- ]?ups?\b/, /\bmiss(es|ed|ing)?\b[^.]{0,25}\b(calls?|them|messages?|texts?)\b/, /\bvoicemails?\b/, /\bcall(ing)? back\b/, /\bcrm\b/, /\bgohighlevel\b/, /\bhubspot\b/, /\bquote requests?\b/, /\bappointment requests?\b/, /\bbook(ing)? (a |an )?(call|appointment|consult)/,
    // People going elsewhere because nobody answered, in any language a visitor is likely to write in.
    /\b(nobody|no one|no-one) (answers|replies|responds|picks up|gets back)/, /\bunanswered\b/, /\b(somewhere|someone) else\b|\belsewhere\b|\bcompetitors?\b|\bwhoever (answers|replies)/, /\bafter hours\b/, /\bgo(es|ne)? cold\b/,
    /\bnadie (contesta|responde)\b/],
  data: [/\bspreadsheets?\b/, /\bexcel\b/, /\bgoogle sheets?\b/, /\bcop(y|ying|ied)\b/, /\bpast(e|ing)\b/, /\bdata\b/, /\bentering data\b/, /\bre-?(enter|type)/, /\breports?\b/, /\bcsv\b/, /\bexports?\b/, /\bimport(s|ed|ing)?\b/, /\bsync/, /\brecords\b/, /\bby hand\b/, /\bmanually\b/, /\binvoices?\b/, /\bquickbooks\b/, /\bshopify\b/, /\bclean(ed|ing)?( it| them)? up\b/, /\bmatch(es|ed|ing)?\b/],
  support: [/\bcustomer questions?\b/, /\bsame questions?\b/, /\bquestions\b/, /\bsupport\b/, /\bfaqs?\b/, /\binbox\b/, /\btickets?\b/, /\bcustomer service\b/, /\banswering\b/, /\border status\b/, /\b(opening|business) hours\b/],
  app: [/\bapps?\b/, /\bplatform\b/, /\bmarketplace\b/, /\bportal\b/, /\bmvp\b/, /\blaunch\b/, /\bstartup\b/, /\bidea for\b/],
  website: [/\bweb ?sites?\b/, /\bweb ?pages?\b/, /\blanding pages?\b/, /\bhome ?page\b/, /\bour site\b/, /\bwordpress\b/, /\bsquarespace\b/, /\bwix\b/, /\bgodaddy\b/, /\bdomain\b/],
};

// How many of each kind's signal words the visitor's text has.
export function kindScores(text) {
  const lower = String(text).toLowerCase();
  return Object.fromEntries(Object.entries(SIGNALS).map(([kind, patterns]) =>
    [kind, patterns.filter(re => re.test(lower)).length]));
}

// Which kind of work the visitor's own words point to. The ad they came from
// only breaks ties; clear words in their text win.
export function pickKind(text, adKind = null) {
  const scores = kindScores(text);
  const fallback = KINDS.includes(adKind) ? adKind : 'general';
  if (Object.hasOwn(scores, fallback)) scores[fallback] += 0.5;
  const [best, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return score >= 1 ? best : fallback;
}

// The ad page for a ?for= value, or null. hasOwn so ?for=constructor or
// ?for=__proto__ fall back to the plain page.
export function adFor(key) {
  return typeof key === 'string' && Object.hasOwn(AD_PAGES, key) ? AD_PAGES[key] : null;
}

// The same words in another language: every string in an ad page or outline
// looked up in that language's strings (scripts/i18n.mjs), keeping the English
// where there's no translation. Keys like `kind` are ids, never translated.
const NOT_WORDS = new Set(['kind']);
export function localize(value, strings, key = null) {
  if (key !== null && NOT_WORDS.has(key)) return value;
  if (typeof value === 'string') return strings && Object.hasOwn(strings, value) ? strings[value] : value;
  if (Array.isArray(value)) return value.map(v => localize(v, strings));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localize(v, strings, k)]));
  }
  return value;
}
