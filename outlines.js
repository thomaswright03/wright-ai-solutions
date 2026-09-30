// The words behind /start, shared by the page (start.js) and the server
// (worker/index.js), so an outline the server sends by email is exactly the one
// the visitor saw. Plain data and one pure function: no DOM, no network.

// The kinds of work the studio does. Every outline has one.
export const KINDS = ['leads', 'data', 'support', 'app', 'general'];

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
  leads: [/\bleads?\b/, /\binquir/, /\benquir/, /\bprospects?\b/, /\bfollow[- ]?ups?\b/, /\bmiss(ed|ing)?( the| our)? (calls?|them)\b/, /\bvoicemails?\b/, /\bcall(ing)? back\b/, /\bcrm\b/, /\bgohighlevel\b/, /\bhubspot\b/, /\bquote requests?\b/, /\bappointment requests?\b/, /\bbook(ing)? (a |an )?(call|appointment|consult)/],
  data: [/\bspreadsheets?\b/, /\bexcel\b/, /\bgoogle sheets?\b/, /\bcop(y|ying|ied)\b/, /\bpast(e|ing)\b/, /\bdata entry\b/, /\bentering data\b/, /\bre-?(enter|type)/, /\breports?\b/, /\bcsv\b/, /\bexports?\b/, /\bimport(s|ed|ing)?\b/, /\bsync/, /\brecords\b/, /\bby hand\b/, /\bmanually\b/, /\binvoices?\b/, /\bquickbooks\b/, /\bshopify\b/],
  support: [/\bcustomer questions?\b/, /\bsame questions?\b/, /\bquestions\b/, /\bsupport\b/, /\bfaqs?\b/, /\binbox\b/, /\btickets?\b/, /\bcustomer service\b/, /\banswering\b/],
  app: [/\bapps?\b/, /\bwebsite\b/, /\bweb ?site\b/, /\bplatform\b/, /\bmarketplace\b/, /\bportal\b/, /\bmvp\b/, /\blaunch\b/, /\bstartup\b/, /\bidea for\b/],
};

// Which kind of work the visitor's own words point to. The ad they came from
// only breaks ties; clear words in their text win.
export function pickKind(text, adKind = null) {
  const lower = String(text).toLowerCase();
  const scores = Object.fromEntries(Object.entries(SIGNALS).map(([kind, patterns]) =>
    [kind, patterns.filter(re => re.test(lower)).length]));
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
