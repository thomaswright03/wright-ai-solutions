// The emails /start sends, as { subject, html, text }. Every value that came
// from a visitor or the AI is escaped before it goes into HTML. The visitor's
// own words go only to Thomas, never back out to the address they typed, so
// the form can't be used to send someone else a message.
import { escapeHtml as esc } from './http.js';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = '#1a1a24';
const MUTED = '#5a5a6e';
const ACCENT = '#5b4bdb';

const h2 = text => `<h2 style="margin:24px 0 8px;font-size:16px;line-height:1.3;color:${INK};">${esc(text)}</h2>`;
const para = (content, style = '') => `<p style="margin:0 0 12px;${style}">${content}</p>`;
const list = (items, tag) =>
  `<${tag} style="margin:0 0 12px;padding-left:22px;">${items.map(i => `<li style="margin:0 0 6px;">${esc(i)}</li>`).join('')}</${tag}>`;
const button = (href, label) =>
  `<p style="margin:24px 0;"><a href="${esc(href)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;">${esc(label)}</a></p>`;

function layout({ title, preheader, body, footer }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f8;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e3e3ec;border-radius:12px;">
<tr><td style="padding:28px;font-family:${FONT};font-size:16px;line-height:1.55;color:${INK};">
${body}
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;"><tr><td style="padding:16px 28px;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">
${footer}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

const SIGNATURE_HTML = para('Thomas Wright<br>Wright AI Solutions LLC<br><a href="https://wright-ai-solutions.com" style="color:' + ACCENT + ';">wright-ai-solutions.com</a> · (801) 580-8630', 'margin-top:24px;');
const SIGNATURE_TEXT = 'Thomas Wright\nWright AI Solutions LLC\nwright-ai-solutions.com · (801) 580-8630';

function outlineHtml(outline) {
  return [
    `<h1 style="margin:8px 0 4px;font-size:22px;line-height:1.3;color:${INK};">${esc(outline.title)}</h1>`,
    h2('What I\'d build'), para(esc(outline.build)),
    h2('How it would work'), list(outline.steps, 'ol'),
    h2('What I\'d need from you'), list(outline.needs, 'ul'),
    h2('A first milestone we could aim for'), para(esc(outline.milestone)),
    h2('What I\'d ask you on a call'), list(outline.questions, 'ul'),
  ].join('\n');
}

function outlineText(outline) {
  return [
    outline.title.toUpperCase(),
    '',
    'What I\'d build',
    outline.build,
    '',
    'How it would work',
    ...outline.steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    'What I\'d need from you',
    ...outline.needs.map(s => `- ${s}`),
    '',
    'A first milestone we could aim for',
    outline.milestone,
    '',
    'What I\'d ask you on a call',
    ...outline.questions.map(s => `- ${s}`),
  ].join('\n');
}

const draftNote = source => source === 'ai'
  ? 'It\'s a first draft that AI wrote from what you typed. I read every outline, and we\'d sharpen it together on a call.'
  : 'It\'s a first draft based on what you typed. We\'d sharpen it together on a call.';

// To the visitor: the outline they asked for.
export function outlineEmail({ outline, source, bookLink, forgetLink, followUp, postalAddress = '' }) {
  const subject = `Your project outline: ${outline.title}`;
  const cta = bookLink
    ? { html: button(bookLink, 'Pick a time to talk') + para('Or just reply to this email.'), text: `Pick a time to talk: ${bookLink}\nOr just reply to this email.` }
    : { html: para('Reply to this email and we\'ll find a time to talk.'), text: 'Reply to this email and we\'ll find a time to talk.' };
  const why = 'You\'re getting this because this address was entered at wright-ai-solutions.com/start to receive this outline. If that wasn\'t you, you can ignore it.';
  const reminder = followUp ? ' You asked for one reminder tomorrow if you haven\'t picked a time; deleting your details cancels it.' : '';
  return {
    subject,
    html: layout({
      title: subject,
      preheader: `${outline.title}: what I'd build, how it would work and a first milestone.`,
      body: [
        para('Hi,'),
        para(`Here's the project outline you asked for. ${esc(draftNote(source))}`),
        outlineHtml(outline),
        cta.html,
        SIGNATURE_HTML,
      ].join('\n'),
      footer: `${esc(why + reminder)} <a href="${esc(forgetLink)}" style="color:${MUTED};">Delete my details</a>${postalAddress ? `<br>Wright AI Solutions LLC · ${esc(postalAddress)}` : ''}`,
    }),
    text: [
      'Hi,',
      '',
      `Here's the project outline you asked for. ${draftNote(source)}`,
      '',
      outlineText(outline),
      '',
      cta.text,
      '',
      SIGNATURE_TEXT,
      '',
      '--',
      why + reminder,
      `Delete my details: ${forgetLink}`,
      ...(postalAddress ? [`Wright AI Solutions LLC · ${postalAddress}`] : []),
    ].join('\n'),
  };
}

const AD_WORDS = ad => (ad === 'none' ? 'no ad' : `the "${ad}" ad`);

// To Thomas: everything about a new lead, with Reply-To set to the visitor.
// Sent again when they correct their address, so a reply reaches the right one.
export function leadEmail({ lead, outline, adminLink, correctedFrom = null }) {
  const subject = `${correctedFrom ? 'Corrected address' : 'New lead'}: ${outline.title}`;
  const intro = (email, oldEmail) => (correctedFrom
    ? `${email} saved an outline on /start, then corrected their address (it was ${oldEmail}). Reply to this email to answer them directly.`
    : `${email} saved an outline on /start. Reply to this email to answer them directly.`);
  const facts = [
    ['Email', lead.email],
    ['Came from', `${AD_WORDS(lead.ad)}${lead.src !== 'direct' ? ` (${lead.src})` : ''}`],
    ['Outline', lead.source === 'ai' ? 'written by AI' : 'template (the AI was unavailable)'],
    ['Reminder tomorrow', lead.follow_up ? 'yes, they asked for one' : 'no'],
  ];
  return {
    subject,
    html: layout({
      title: subject,
      preheader: `${lead.email} saved an outline on /start.`,
      body: [
        para(intro(`<strong>${esc(lead.email)}</strong>`, esc(correctedFrom || ''))),
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">${facts.map(([k, v]) =>
          `<tr><td style="padding:2px 16px 2px 0;color:${MUTED};">${esc(k)}</td><td style="padding:2px 0;">${esc(v)}</td></tr>`).join('')}</table>`,
        h2('In their words'),
        `<blockquote style="margin:0 0 12px;padding:8px 16px;border-left:3px solid ${ACCENT};color:${INK};">${esc(lead.problem)}</blockquote>`,
        outlineHtml(outline),
        button(adminLink, 'Open your leads list'),
      ].join('\n'),
      footer: esc('Sent by wright-ai-solutions.com/start. Their details are also in your leads list.'),
    }),
    text: [
      intro(lead.email, correctedFrom),
      '',
      ...facts.map(([k, v]) => `${k}: ${v}`),
      '',
      'In their words:',
      lead.problem,
      '',
      outlineText(outline),
      '',
      `Your leads list: ${adminLink}`,
    ].join('\n'),
  };
}

// To the visitor, once, the day after they saved, only if they ticked the box
// and haven't booked. It carries the postal address US law (CAN-SPAM) asks for.
export function followUpEmail({ outline, bookLink, forgetLink, postalAddress }) {
  const subject = `Following up on your outline: ${outline.title}`;
  const cta = bookLink
    ? { html: button(bookLink, 'Pick a time to talk') + para('Or reply to this email with any questions.'), text: `Pick a time to talk: ${bookLink}\nOr reply to this email with any questions.` }
    : { html: para('Reply to this email and we\'ll find a time.'), text: 'Reply to this email and we\'ll find a time.' };
  const why = 'You asked for this one reminder when you saved your outline at wright-ai-solutions.com/start. This is the only one.';
  return {
    subject,
    html: layout({
      title: subject,
      preheader: 'A quick call is the fastest way to see if it\'s a fit.',
      body: [
        para('Hi,'),
        para(`Following up on your outline for “${esc(outline.title)}”: if you'd like to talk it through, a 15-minute call is the quickest way to see if it's a fit.`),
        cta.html,
        para('If you\'ve already picked a time, thank you, and you can ignore this one.'),
        SIGNATURE_HTML,
      ].join('\n'),
      footer: `${esc(why)} <a href="${esc(forgetLink)}" style="color:${MUTED};">Unsubscribe and delete my details</a><br>Wright AI Solutions LLC · ${esc(postalAddress)}`,
    }),
    text: [
      'Hi,',
      '',
      `Following up on your outline for "${outline.title}": if you'd like to talk it through, a 15-minute call is the quickest way to see if it's a fit.`,
      '',
      cta.text,
      '',
      'If you\'ve already picked a time, thank you, and you can ignore this one.',
      '',
      SIGNATURE_TEXT,
      '',
      '--',
      why,
      `Unsubscribe and delete my details: ${forgetLink}`,
      `Wright AI Solutions LLC · ${postalAddress}`,
    ].join('\n'),
  };
}
