/**
 * Website.gs — EVERYTHING that belongs to the public homepage lives in this one file.
 *
 * "Website Management" (Index.html, sidebar group "Website") edits the public homepage and its
 * inner pages. Homepage.html needs no change to show what is saved: when nothing is saved it
 * keeps rendering its built-in DEFAULT_HOME, and as soon as the administrator saves, the saved
 * copy wins.
 *
 * HOW TO FIND THINGS (search for the section number)
 *   1. CONFIGURATION          keys, limits, cache names, page catalogue      <- change limits here
 *   2. DEFAULT CONTENT        SITE_SEED_ (what visitors see before any save) <- change default text here
 *   3. SANITISING             wsS_ / wsLink_ / wsImg_ and siteClean_         <- add or rename a field here
 *   4. STORAGE                read/write of the Content-sheet rows, caching
 *   5. PUBLIC ENDPOINTS       no sign-in: homepage, inner pages, policy, home URL
 *   6. VISITOR SIGN-IN        homepage* wrappers around the portal's account system
 *   7. EDITOR ENDPOINTS       administrator-only: what Website Management calls
 *
 * WHERE THE DATA LIVES (existing Content sheet; Key in column A, JSON in column B)
 *   homepage_data   the homepage sections       (SITE_KEY)
 *   pages_data      the inner pages' text       (PAGES_KEY)
 *   privacy         the Data Privacy Policy     (Content!A2, edited in the portal, shown on the Privacy page)
 *
 * homepage_data shape (every key optional; Homepage.html's applyContent() ignores what it does not use):
 *   sections.masthead  { tagline, ids:[{name,short,logo,fb}] }
 *   sections.hero      { title,name,subtitle,desc,intervalMs,enroll:{label,to},discover:{label,to},slides:[url] }
 *   sections.values    { items:[{label,icon,on}] }
 *   sections.admission { title,sub,steps:[{t,d,i}] }
 *   sections.about     { heading,text,linkLabel,photo }
 *   sections.programs  { title,items:[{name,desc,on}] }
 *   sections.news      { title,items:[{title,date,summary,link}] }
 *   sections.footer    { loc,phone,email,fb,yt, centers:[{name,addr}], contacts:[{label,phone}], emails:[string] }
 *   sections.nav       { menus:[{ label,lead, subs:[{label,lead,icon}] }] }   (structure is fixed)
 *   sections.display   { order:[key], hidden:[key] }
 *
 * Inner pages (About, Admissions, Academics, Campus Life, Forms, News and the footer pages) are
 * written as plain text and stored as the block list Homepage.html's blocksHtml() renders:
 *   "## Heading"          -> { type:'h2' }
 *   "![alt](https://…)"   -> { type:'img' }
 *   any other lines       -> one { type:'p' }  (blank lines separate paragraphs; **bold**,
 *                                                *italic*, [label](url) and "- " bullets work)
 *
 * ADDING A HOMEPAGE FIELD, in order:
 *   a) SITE_SEED_ (section 2)  b) siteClean_ (section 3)  c) the form in Index.html's
 *   "Website Management" block (wsRender)  d) Homepage.html's applyContent().
 *
 * Apps Script shares one global scope across files, so every function below keeps its original
 * name and signature; Index.html, Homepage.html and Router.gs call them exactly as before.
 * Router.gs (doGet) stays where it is: it serves the homepage AND the portal.
 */

/*=============================================================================
 * 1. CONFIGURATION
 * Keys, limits and cache names. The two page-catalogue constants must be defined before PAGES_ROUTES_ is built.
 *=============================================================================*/

const SITE_KEY = 'homepage_data', SITE_CACHE_KEY = 'site_v1', SITE_MAX = 45000;
const SITE_SECTIONS = ['admission', 'about', 'programs', 'news'];

/* Public-site extras (legacy PublicHome endpoints in section 5). */
const PUB_GALLERY_PAGE = 'facilities', PUB_GALLERY_MAX = 5, PUB_EVENTS_MAX = 3;

/* ---------- inner-page catalogue ---------- */
/* Mirrors Homepage.html's DEFAULT_HOME.nav: same labels, same order, same slugs (route ids).
 * noRoot groups have no page of their own (Terms and Privacy are reached from the footer). */
const PAGE_MENU_ = [
  { id: 'about', label: 'About Us', subs: [
    ['vision-mission-and-core-values', 'Vision, Mission & Core Values'],
    ['history', 'History'],
    ['school-leadership', 'School Leadership']] },
  { id: 'admissions', label: 'Admissions', subs: [
    ['enrollment-procedure', 'Enrollment Procedure'],
    ['admission-requirements', 'Admission Requirements'],
    ['scholarships', 'Scholarships'],
    ['frequently-asked-questions', 'Frequently Asked Questions']] },
  { id: 'academics', label: 'Academics', subs: [
    ['kindergarten', 'Kindergarten'],
    ['elementary', 'Elementary'],
    ['junior-high-school', 'Junior High School'],
    ['senior-high-school', 'Senior High School'],
    ['college-program', 'College Program']] },
  { id: 'campus-life', label: 'Campus Life', subs: [
    ['student-organizations', 'Student Organizations'],
    ['school-activities-and-events', 'School Activities & Events'],
    ['sports-and-athletics', 'Sports & Athletics'],
    ['clubs-and-societies', 'Clubs & Societies'],
    ['campus-facilities-and-tour', 'Campus Facilities & Tour']] },
  { id: 'forms', label: 'Downloadable Forms', subs: [
    ['downloadable-forms', 'Downloadable Forms']] },
  { id: 'news', label: 'News & Updates', subs: [
    ['school-announcements', 'School Announcements'],
    ['latest-news', 'Latest News'],
    ['upcoming-events', 'Upcoming Events'],
    ['enrollment-announcements', 'Enrollment Announcements'],
    ['school-achievements', 'School Achievements']] },
  /* No 'privacy' here on purpose: the website's Privacy page shows the Data Privacy Policy the
     portal already stores (getPublishedPolicy), so there is only ever one copy of it. */
  { id: 'other', label: 'Other pages', noRoot: true, subs: [
    ['terms', 'Terms of Service']] }
];

const PAGES_KEY = 'pages_data', PAGES_CACHE_KEY = 'pages_v1', PAGE_TEXT_MAX = 6000, PAGES_MAX = 45000;
/* A menu page's route is "<menu>/<slug>", exactly what Homepage.html's links and cur_route() use. */
const pageRoute_ = (g, s) => g.noRoot ? s[0] : g.id + '/' + s[0];
const PAGES_ROUTES_ = [];
PAGE_MENU_.forEach(g => { if (!g.noRoot) PAGES_ROUTES_.push(g.id); g.subs.forEach(s => PAGES_ROUTES_.push(pageRoute_(g, s))); });

/*=============================================================================
 * 2. DEFAULT CONTENT
 * The built-in content (mirrors Homepage.html's DEFAULT_HOME). The admin form starts from this same text.
 *=============================================================================*/

const SITE_SEED_ = {
  sections: {
    masthead: {
      tagline: 'Learn · Grow · Excel',
      ids: [
        { name: 'Moreh Academy', short: 'MA', logo: '', fb: 'https://facebook.com/ilovemoreh' },
        { name: 'Moreh Global Innovative College', short: 'MG', logo: '', fb: 'https://facebook.com/MorehGlobal2019' },
        { name: 'Moreh College', short: 'MC', logo: '', fb: 'https://facebook.com/morehcollege' }
      ]
    },
    hero: {
      title: 'Welcome to', name: 'Moreh Academy',
      subtitle: 'School of Righteousness and Excellence.',
      desc: 'Welcome to Moreh Academy. School of Righteousness and Excellence.',
      intervalMs: 6500,
      enroll: { label: 'Enroll Now!', to: '#create' },
      discover: { label: 'Discover Moreh Academy', to: 'route:about' },
      slides: ['', '', '']
    },
    values: {
      items: [
        { label: 'Quality Education', icon: '📘', on: true },
        { label: 'Holistic Development', icon: '🧍', on: true },
        { label: 'Academic Excellence', icon: '🏆', on: true },
        { label: 'Supportive Community', icon: '🤝', on: true },
        { label: 'A Brighter Future', icon: '⭐', on: true }
      ]
    },
    admission: {
      title: 'Your Journey to Moreh Academy',
      sub: 'Six simple steps toward becoming a Moreh Academy student.',
      steps: [
        { t: 'Create an Account', d: 'Register your applicant account.', i: '👤' },
        { t: 'Complete Application', d: 'Fill out the application form.', i: '📝' },
        { t: 'Submit Requirements', d: 'Upload the required documents.', i: '📎' },
        { t: 'Application Review', d: 'Application assessment by the school.', i: '🔍' },
        { t: 'Admission Decision', d: 'Receive your application result.', i: '📬' },
        { t: 'Enrollment Confirmation', d: 'Complete your enrollment.', i: '✅' }
      ]
    },
    about: {
      heading: 'Building a Strong Foundation for Lifelong Success',
      linkLabel: 'Learn More',
      text: 'Moreh Academy is a learning community committed to providing excellent and values-driven education from Kindergarten to Grade 12.',
      photo: ''
    },
    programs: {
      title: 'Academic Programs',
      items: [
        { name: 'Kindergarten', desc: 'A caring start to learning.', on: true },
        { name: 'Elementary', desc: 'Strong foundations in core subjects.', on: true },
        { name: 'Junior High School', desc: 'Skills and character for adolescence.', on: true },
        { name: 'Senior High School', desc: 'Clusters that prepare for college and career.', on: true },
        { name: 'College Program', desc: 'Higher education pathways.', on: true }
      ]
    },
    news: { title: 'News & Announcements', items: [] },
    /* Labels for the top menu and the cards on each group page (subs: [title, text, icon]). */
    nav: { menus: [
      { label: 'About Us', lead: 'Who we are and what we believe.', subs: [
        ['Vision, Mission & Core Values', 'The vision, mission and values that guide everything we do.', '🎯'],
        ['History', 'From one campus in 2001 to a multi-campus school community.', '📜'],
        ['School Leadership', 'Meet the people who lead Moreh Academy.', '👥']] },
      { label: 'Admissions', lead: 'Everything you need to enroll.', subs: [
        ['Enrollment Procedure', 'The steps to become a Moreh Academy student.', '📝'],
        ['Admission Requirements', 'The documents and conditions you need to prepare.', '📋'],
        ['Scholarships', 'Programs that help families with the cost of education.', '🎓'],
        ['Frequently Asked Questions', 'Quick answers to common admission questions.', '❓']] },
      { label: 'Academics', lead: 'Learning programs from Kindergarten to College.', subs: [
        ['Kindergarten', 'A caring start to learning.', '🧸'],
        ['Elementary', 'Strong foundations in core subjects.', '📚'],
        ['Junior High School', 'Skills and character for adolescence.', '🧭'],
        ['Senior High School', 'Strands that prepare for college and career.', '🎓'],
        ['College Program', 'Higher education pathways.', '🏛️']] },
      { label: 'Campus Life', lead: 'Life beyond the classroom.', subs: [
        ['Student Organizations', 'Student-led groups that build leadership and service.', '🧑‍🤝‍🧑'],
        ['School Activities & Events', 'Programs and celebrations throughout the school year.', '🎉'],
        ['Sports & Athletics', 'Teams, training and friendly competition.', '⚽'],
        ['Clubs & Societies', 'Interest groups for every talent and passion.', '🎨'],
        ['Campus Facilities & Tour', 'Take a look around our learning spaces.', '🏫']] },
      { label: 'Downloadable Forms', lead: 'Forms you can download and print.', subs: [
        ['Downloadable Forms', 'Download and print the school forms.', '📄']] },
      { label: 'News & Updates', lead: 'The latest from Moreh Academy.', subs: [
        ['School Announcements', 'Official notices from the school.', '📢'],
        ['Latest News', 'Stories and updates from our community.', '📰'],
        ['Upcoming Events', 'Dates to mark on your calendar.', '📅'],
        ['Enrollment Announcements', 'Enrollment schedules and reminders.', '📣'],
        ['School Achievements', 'Celebrating our students and staff.', '🏅']] }
    ] },
    footer: {
      loc: 'Moreh Academy, Taguig City, Philippines',
      phone: 'Admissions: 0961 876 6886',
      email: 'registrar@morehacademy.com',
      fb: 'https://facebook.com/ilovemoreh',
      yt: 'https://youtube.com/',
      centers: [
        { name: 'Learning Center 1', addr: 'Ricahuerta St. corner A. Bonifacio Avenue, Upper Bicutan, Taguig City' },
        { name: 'Learning Center 2', addr: 'Ricahuerta St., Upper Bicutan, Taguig City' },
        { name: 'Learning Center 3', addr: 'Reyes St. corner Makintar St., Central Bicutan, Taguig City' }
      ],
      contacts: [
        { label: 'Learning Center 1', phone: '0970 860 9433' },
        { label: 'Learning Center 3', phone: '0961 876 6886' },
        { label: 'College', phone: '0927 341 0437' }
      ],
      emails: ['registrar@morehacademy.com', 'morehians@gmail.com', 'morehcollegestaguig@gmail.com']
    },
    display: { order: ['admission', 'about', 'programs', 'news'], hidden: [] }
  }
};

/*=============================================================================
 * 3. SANITISING
 * Never trust what the browser posts. Every saved field passes through here.
 *=============================================================================*/

const wsS_ = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, n);
const wsLink_ = v => /^(https?:\/\/|mailto:|#|route:)/i.test(String(v == null ? '' : v).trim()) ? String(v).trim().slice(0, 500) : '';
const wsImg_ = v => /^https?:\/\//i.test(String(v == null ? '' : v).trim()) ? String(v).trim().slice(0, 500) : '';
const wsArr_ = (a, n) => Array.isArray(a) ? a.slice(0, n) : [];
/* An absent field keeps its built-in text, so content saved before a card existed still opens. */
const wsPick_ = (v, d, n) => v == null ? d : wsS_(v, n);

function wsFtList_(v, seed, map, keep) {
  const out = wsArr_(v, 6).map(map).filter(keep);
  return out.length ? out : seed;
}

function siteClean_(d) {
  d = d || {};
  const S = d.sections || d;
  const mast = S.masthead || {}, hero = S.hero || {}, adm = S.admission || {}, ab = S.about || {},
        pr = S.programs || {}, nw = S.news || {}, ft = S.footer || {}, dp = S.display || {},
        navSeed = SITE_SEED_.sections.nav.menus, navIn = S.nav && Array.isArray(S.nav.menus) ? S.nav.menus : [];

  const slides = wsArr_(hero.slides, 8).map(wsImg_);   // an empty entry keeps the coloured background
  const order = wsArr_(dp.order, 8).map(String).filter(k => SITE_SECTIONS.indexOf(k) >= 0);
  SITE_SECTIONS.forEach(k => { if (order.indexOf(k) < 0) order.push(k); });

  const sections = {
    masthead: {
      tagline: wsS_(mast.tagline, 120),
      ids: wsArr_(mast.ids, 6).map(x => ({
        name: wsS_(x && x.name, 80), short: wsS_(x && x.short, 4),
        logo: wsImg_(x && x.logo), fb: wsLink_(x && x.fb)
      })).filter(x => x.name)
    },
    hero: {
      title: wsS_(hero.title, 80), name: wsS_(hero.name, 80),
      subtitle: wsS_(hero.subtitle, 200), desc: wsS_(hero.desc, 400),
      intervalMs: Math.min(30000, Math.max(2000, parseInt(hero.intervalMs, 10) || 6500)),
      enroll: { label: wsS_(hero.enroll && hero.enroll.label, 40), to: wsLink_(hero.enroll && hero.enroll.to) },
      discover: { label: wsS_(hero.discover && hero.discover.label, 40), to: wsLink_(hero.discover && hero.discover.to) },
      slides: slides.length ? slides : ['']
    },
    values: {
      items: wsArr_(S.values && S.values.items, 10).map(x => ({
        label: wsS_(x && x.label, 60), icon: wsS_(x && x.icon, 8), on: !(x && x.on === false)
      })).filter(x => x.label)
    },
    admission: {
      title: wsS_(adm.title, 120), sub: wsS_(adm.sub, 300),
      steps: wsArr_(adm.steps, 10).map(x => ({
        t: wsS_(x && x.t, 80), d: wsS_(x && x.d, 300), i: wsS_(x && x.i, 8)
      })).filter(x => x.t)
    },
    about: {
      heading: wsS_(ab.heading, 140), text: wsS_(ab.text, 1200),
      linkLabel: wsS_(ab.linkLabel, 40), photo: wsImg_(ab.photo)
    },
    programs: {
      title: wsS_(pr.title, 120),
      items: wsArr_(pr.items, 12).map(x => ({
        name: wsS_(x && x.name, 80), desc: wsS_(x && x.desc, 300), on: !(x && x.on === false)
      })).filter(x => x.name)
    },
    news: {
      title: wsS_(nw.title, 120),
      items: wsArr_(nw.items, 12).map(x => ({
        title: wsS_(x && x.title, 120), date: wsS_(x && x.date, 40),
        summary: wsS_(x && x.summary, 600), link: wsLink_(x && x.link)
      })).filter(x => x.title)
    },
    footer: {
      loc: wsS_(ft.loc, 200), phone: wsS_(ft.phone, 120),
      email: wsS_(ft.email, 120), fb: wsLink_(ft.fb), yt: wsLink_(ft.yt),
      /* Lists: an empty or absent list keeps the built-in text, so content saved before these fields existed still opens. */
      centers: wsFtList_(ft.centers, SITE_SEED_.sections.footer.centers, x => ({ name: wsS_(x && x.name, 80), addr: wsS_(x && x.addr, 200) }), x => x.name || x.addr),
      contacts: wsFtList_(ft.contacts, SITE_SEED_.sections.footer.contacts, x => ({ label: wsS_(x && x.label, 80), phone: wsS_(x && x.phone, 60) }), x => x.label || x.phone),
      emails: wsFtList_(ft.emails, SITE_SEED_.sections.footer.emails, x => wsS_(x, 120), x => x)
    },
    display: {
      order: order,
      hidden: wsArr_(dp.hidden, 8).map(String).filter(k => SITE_SECTIONS.indexOf(k) >= 0 || k === 'values')
    },
    /* The six menus and the cards on each group page. Structure (which cards exist, and their
       addresses) is fixed by the seed; only the visible words are editable. */
    nav: {
      menus: navSeed.map((sm, i) => {
        const m = navIn[i] || {};
        return {
          label: wsPick_(m.label, sm.label, 60), lead: wsPick_(m.lead, sm.lead, 200),
          subs: sm.subs.map((ss, j) => {
            const e = (m.subs || [])[j] || {};
            return { label: wsPick_(e.label, ss[0], 80), lead: wsPick_(e.lead, ss[1], 240), icon: wsPick_(e.icon, ss[2], 8) };
          })
        };
      })
    }
  };
  return sections;
}

/*=============================================================================
 * 4. STORAGE
 * Content-sheet rows and the 5-minute script cache.
 *=============================================================================*/

/* ---------- homepage sections ---------- */
function siteRow_() { return blockRow_(SITE_KEY); }

function siteRead_() {
  const cache = CacheService.getScriptCache();
  try { const hit = cache.get(SITE_CACHE_KEY); if (hit) return JSON.parse(hit); } catch (_) {}
  const b = siteRow_();
  let raw = null;
  if (b.row) { try { raw = JSON.parse(String(b.sh.getRange(b.row, 2).getValue() || '')); } catch (_) {} }
  if (!raw || !raw.sections) return null;
  const out = { updatedAt: String(raw.updatedAt || ''), updatedBy: String(raw.updatedBy || ''), sections: siteClean_(raw) };
  try { cache.put(SITE_CACHE_KEY, JSON.stringify(out), 300); } catch (_) {}
  return out;
}

/* ---------- inner pages ---------- */
function pagesRow_() { return blockRow_(PAGES_KEY); }

/** Plain text -> the block list Homepage.html's blocksHtml() renders. */
function pagesBlocks_(t) {
  const out = [], lines = String(t == null ? '' : t).replace(/\r/g, '').split('\n');
  let para = [];
  const flush = () => { if (para.length) { out.push({ type: 'p', text: para.join('\n') }); para = []; } };
  lines.forEach(line => {
    const h = /^\s*#{1,3}\s+(.+)$/.exec(line), im = /^\s*!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)\s*$/.exec(line);
    if (h) { flush(); out.push({ type: 'h2', text: h[1].trim() }); }
    else if (im) { flush(); out.push({ type: 'img', url: im[2], alt: im[1] }); }
    else para.push(line);
  });
  flush();
  return out.slice(0, 80);
}

/** Block list -> the text the editor shows (round-trips what pagesBlocks_ produces). */
function pagesText_(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map(b => {
    if (!b) return '';
    if (b.type === 'h2') return '## ' + String(b.text || '');
    if (b.type === 'img') return '![' + String(b.alt || '') + '](' + String(b.url || '') + ')';
    if (b.type === 'ul') return (b.items || []).map(x => '- ' + String(x)).join('\n');
    return String(b.text || '');
  }).filter(s => s.trim()).join('\n\n');
}

function pagesEmpty_() { const p = {}; PAGES_ROUTES_.forEach(r => { p[r] = ''; }); return p; }

function pagesRead_() {
  const cache = CacheService.getScriptCache();
  try { const hit = cache.get(PAGES_CACHE_KEY); if (hit) return JSON.parse(hit); } catch (_) {}
  const b = pagesRow_();
  let raw = null;
  if (b.row) { try { raw = JSON.parse(String(b.sh.getRange(b.row, 2).getValue() || '')); } catch (_) {} }
  if (!raw || !raw.pages) return null;
  const pages = {};
  PAGES_ROUTES_.forEach(r => { if (Array.isArray(raw.pages[r]) && raw.pages[r].length) pages[r] = raw.pages[r]; });
  const out = { updatedAt: String(raw.updatedAt || ''), updatedBy: String(raw.updatedBy || ''), pages: pages };
  try { cache.put(PAGES_CACHE_KEY, JSON.stringify(out), 300); } catch (_) {}
  return out;
}

/*=============================================================================
 * 5. PUBLIC ENDPOINTS
 * No sign-in. Return only what is safe for anyone on the internet.
 *=============================================================================*/

/* ---------- homepage and inner pages (called by Homepage.html) ---------- */
/** PUBLIC. Homepage.html calls this at boot and passes the result straight to applyContent(),
 *  so it must return the content itself — not an ok() wrapper. null = use the built-in defaults. */
function getPublishedHomepage() { try { return siteRead_(); } catch (e) { return null; } }

/** PUBLIC. The homepage's draft preview reads the same saved copy. */
function getDraftHomepage() { return getPublishedHomepage(); }

/** PUBLIC. Homepage.html stores the result at HOME.pages[route]; null = nothing saved for that page.
 *  Like getPublishedHomepage() this returns the content itself, not an ok() wrapper. */
function getPublishedPage(route) {
  try { const d = pagesRead_(), p = d && d.pages[String(route || '')]; return p && p.length ? { blocks: p } : null; } catch (e) { return null; }
}
function getDraftPage(route) { return getPublishedPage(route); }

/** PUBLIC. The website's Privacy page. It renders the Data Privacy Policy the portal already
 *  stores in Content!A2 (edited in the portal, sanitized by cleanPolicy_), so the two can never
 *  drift apart. Returns the sanitized HTML itself: Homepage.html hands it straight to the page. */
function getPublishedPolicy() {
  try { return cleanPolicy_(String(contentSh_().getRange(2, 2).getValue() || '')); } catch (e) { return ''; }
}

/* ---------- homepage links, campus photos, vision / mission (legacy PublicHome endpoints) ---------- */
/** PUBLIC. Everything the homepage needs in one call (cached 5 minutes). */
function getPublicContent() {
  try {
    const cache = CacheService.getScriptCache(), tz = Session.getScriptTimeZone();
    const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), ck = 'pubc_v1_' + today;
    const hit = cache.get(ck); if (hit) return JSON.parse(hit);

    const gb = blockRow_('guide');
    const guide = gb.row ? cleanPolicy_(String(gb.sh.getRange(gb.row, 2).getValue() || '')) : '';

    const events = evRows_()
      .filter(e => e.Category !== 'Announcement' && e.EventDate >= today)
      .sort((a, b) => (a.EventDate + a.EventTime).localeCompare(b.EventDate + b.EventTime))
      .slice(0, PUB_EVENTS_MAX)
      .map(e => ({ t: e.Title, d: e.EventDate, v: e.Venue }));

    const gallery = galRead_(PUB_GALLERY_PAGE).list.slice(0, PUB_GALLERY_MAX).map(p => ({ id: p.id, cap: p.cap }));

    const out = ok({ sy: activeSY_(), portal: ScriptApp.getService().getUrl() + '?page=portal', guide: guide, events: events, gallery: gallery });
    try { cache.put(ck, JSON.stringify(out), 300); } catch (_) {}
    return out;
  } catch (e) { return fail(e); }
}

/** PUBLIC. One campus photo as a data URI. Serves ONLY photos shown on the homepage, so it cannot read other Drive files. */
function getPublicPhoto(id) {
  try {
    id = String(id || '');
    if (!galRead_(PUB_GALLERY_PAGE).list.slice(0, PUB_GALLERY_MAX).some(x => x.id === id)) throw new Error('Photo not found.');
    const cache = CacheService.getScriptCache(), k = 'pubp_' + id, hit = cache.get(k);
    if (hit) return ok(hit);
    const uri = photo_(id);
    if (uri && uri.length < 95000) { try { cache.put(k, uri, 21600); } catch (_) {} }   // cache entries are limited to 100 KB
    return ok(uri);
  } catch (e) { return fail(e); }
}

/** PUBLIC. Vision, mission, core values and history. Leaders (names, emails, phones, photos) are NOT returned. */
function getPublicAbout() {
  try {
    const cache = CacheService.getScriptCache(), hit = cache.get('puba_v1');
    if (hit) return JSON.parse(hit);
    const a = aboutRead_();
    const out = ok({ vision: a.vision, mission: a.mission, values: a.values, timeline: a.timeline });
    try { cache.put('puba_v1', JSON.stringify(out), 600); } catch (_) {}
    return out;
  } catch (e) { return fail(e); }
}

/** PUBLIC. URL of the public homepage (used by the sign-in page's "Back to homepage" link). */
function getHomeUrl() { return ScriptApp.getService().getUrl(); }

/*=============================================================================
 * 6. VISITOR SIGN-IN (homepage modals)
 * Lets the homepage keep its sign-in / register / password modals while using the portal's credentials,
 * sessions and sheets. There is exactly ONE account system: the Users sheet and login() / verifyOtp() /
 * forgotPassword() / resetPassword() / registerAccount() / confirmRegistration(). These wrappers only trim
 * the payload and keep the portal's session key ('mrh_t') as the single browser token.
 *=============================================================================*/

/** Step 1 of sign-in. Returns {token} on success, {otp,challenge,hint} for staff who need a code. */
function homepageSignIn(username, password) {
  const r = login(username, password);
  if (r && r.success && r.data && r.data.otp) {
    return { success: true, otp: true, challenge: r.data.challenge, hint: r.data.hint, message: 'Enter the 6-digit code sent to your email.' };
  }
  if (r && r.success && r.data && r.data.token) {
    const u = r.data.user || {};
    return { success: true, token: r.data.token, name: u.FullName || u.Username || '', role: u.Role || '' };
  }
  return { success: false, error: (r && r.error) || 'Invalid username or password.' };
}

/** Step 2 of staff sign-in. Returns the same session token the portal uses. */
function homepageVerifyCode(challenge, code) {
  const r = verifyOtp(challenge, code);
  if (r && r.success && r.data && r.data.token) {
    const u = r.data.user || {};
    return { success: true, token: r.data.token, name: u.FullName || u.Username || '', role: u.Role || '' };
  }
  return { success: false, error: (r && r.error) || 'Invalid or expired code.' };
}

/** Public registration step 1: emails a 6-digit code (or registers directly when mail is off). */
function homepageRegister(form) {
  const f = form || {};
  const r = registerAccount({
    surname: f.surname, firstName: f.firstName, lrn: f.lrn, birthdate: f.birthdate,
    username: f.username, email: f.email, password: f.password, password2: f.password2,
    consent: f.consent === true, mobile: f.mobile,
    guardName: f.guardName, guardRel: f.guardRel, guardEmail: f.guardEmail, guardMobile: f.guardMobile
  });
  if (r && r.success && r.data && r.data.pending) {
    return { success: true, challenge: r.data.challenge, hint: r.data.hint, message: r.message || '' };
  }
  if (r && r.success) return { success: true, challenge: '', message: (r && r.message) || 'Account created. You can sign in now.' };
  return { success: false, error: (r && r.error) || 'Could not create the account.' };
}

/** Public registration step 2. */
function homepageConfirmRegistration(challenge, code) {
  const r = confirmRegistration(challenge, code);
  if (r && r.success) return { success: true, id: (r.data && r.data.id) || '', message: r.message || 'Email verified. You can sign in now.' };
  return { success: false, error: (r && r.error) || 'Invalid or expired code.' };
}

/** Always reports the same message, whether or not the account exists (Old AP behaviour). */
function homepageForgotPassword(identifier) {
  const r = forgotPassword(identifier);
  if (r && r.success) return { success: true, message: r.message || 'If the account exists, a 6-digit code has been sent.' };
  return { success: false, error: (r && r.error) || 'Could not send the code.' };
}

function homepageResetPassword(identifier, code, newPassword) {
  const r = resetPassword(identifier, code, newPassword);
  if (r && r.success) return { success: true, message: r.message || 'Password changed. Please sign in.' };
  return { success: false, error: (r && r.error) || 'Could not reset the password.' };
}

/** The homepage never holds a session after redirecting to the portal; this exists for parity. */
function homepageSignOut(token) {
  return logout(token);
}

/*=============================================================================
 * 7. EDITOR ENDPOINTS
 * ADMINISTRATOR / SYSTEM MANAGER only (owner_). These are what the Website Management page calls.
 *=============================================================================*/

/* ---------- homepage sections ---------- */
/** ADMINISTRATOR / SYSTEM MANAGER. The current content (or the built-in defaults before the first save). */
function getSiteAdmin(token) {
  try {
    owner_(token);
    const d = siteRead_();
    return ok({
      home: ScriptApp.getService().getUrl(),
      saved: !!d,
      updatedAt: d ? d.updatedAt : '',
      updatedBy: d ? d.updatedBy : '',
      sections: d ? d.sections : siteClean_(SITE_SEED_)
    });
  } catch (e) { return fail(e); }
}

/** ADMINISTRATOR / SYSTEM MANAGER. Saves and publishes immediately (the homepage reads on next load). */
function saveSiteAdmin(token, sections) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ou = owner_(token);
    const clean = siteClean_(sections);
    const updatedAt = new Date().toISOString();
    const json = JSON.stringify({ updatedAt: updatedAt, updatedBy: ou.Username, sections: clean });
    if (json.length > SITE_MAX) throw new Error('The homepage content is too long to save. Shorten some text or remove a photo link.');
    const b = siteRow_();
    put_(b.sh, b.row || (b.sh.getLastRow() + 1), 1, [[SITE_KEY, json]]);
    CacheService.getScriptCache().remove(SITE_CACHE_KEY);
    audit_(ou, 'website.save', SITE_KEY, '');
    return ok({ saved: true, updatedAt: updatedAt, updatedBy: ou.Username, sections: clean }, 'Website saved. The homepage now shows this content.');
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
}

/** ADMINISTRATOR / SYSTEM MANAGER. Removes the saved copy so the homepage falls back to its built-in content. */
function resetSiteAdmin(token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ou = owner_(token), b = siteRow_();
    if (b.row) put_(b.sh, b.row, 2, [['']]);
    CacheService.getScriptCache().remove(SITE_CACHE_KEY);
    audit_(ou, 'website.reset', SITE_KEY, '');
    return ok({ saved: false, updatedAt: '', updatedBy: '', sections: siteClean_(SITE_SEED_) }, 'Website reset to the built-in content.');
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
}

/* ---------- inner pages ---------- */
/** ADMINISTRATOR / SYSTEM MANAGER. Every inner page's text, plus the page list for the picker. */
function getPagesAdmin(token) {
  try {
    owner_(token);
    const d = pagesRead_(), saved = (d && d.pages) || {}, pages = pagesEmpty_();
    PAGES_ROUTES_.forEach(r => { pages[r] = pagesText_(saved[r]); });
    const sd = siteRead_(), nv = sd && sd.sections && sd.sections.nav && sd.sections.nav.menus;
    return ok({
      saved: !!d, updatedAt: d ? d.updatedAt : '', updatedBy: d ? d.updatedBy : '',
      pages: pages,
      catalogue: PAGE_MENU_.map((g, gi) => {
        /* Menu and card titles are editable on the homepage card; the picker follows them.
           PAGE_MENU_ and SITE_SEED_.nav list the same six menus in the same order. */
        const m = nv && nv[gi];
        return {
          id: g.id, label: (m && m.label) || g.label, noRoot: !!g.noRoot,
          subs: g.subs.map((s, si) => ({ r: pageRoute_(g, s), label: ((m && m.subs && m.subs[si]) || {}).label || s[1] }))
        };
      })
    });
  } catch (e) { return fail(e); }
}

/** ADMINISTRATOR / SYSTEM MANAGER. Replaces every inner page; an emptied page removes its content. */
function savePagesAdmin(token, pages) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ou = owner_(token), clean = {};
    PAGES_ROUTES_.forEach(r => {
      const txt = wsS_(pages && pages[r], PAGE_TEXT_MAX);
      if (!txt) return;
      const blocks = pagesBlocks_(txt);
      if (blocks.length) clean[r] = blocks;
    });
    const updatedAt = new Date().toISOString();
    const json = JSON.stringify({ updatedAt: updatedAt, updatedBy: ou.Username, pages: clean });
    if (json.length > PAGES_MAX) throw new Error('The page content is too long to save. Shorten some pages.');
    const b = pagesRow_();
    put_(b.sh, b.row || (b.sh.getLastRow() + 1), 1, [[PAGES_KEY, json]]);
    CacheService.getScriptCache().remove(PAGES_CACHE_KEY);
    audit_(ou, 'website.pages', PAGES_KEY, '');
    const out = pagesEmpty_();
    PAGES_ROUTES_.forEach(r => { out[r] = pagesText_(clean[r]); });
    return ok({ saved: !!Object.keys(clean).length, updatedAt: updatedAt, updatedBy: ou.Username, pages: out }, 'Inner pages saved. The website now shows this content.');
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
}

/** ADMINISTRATOR / SYSTEM MANAGER. Removes the saved pages so they fall back to their built-in text. */
function resetPagesAdmin(token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ou = owner_(token), b = pagesRow_();
    if (b.row) put_(b.sh, b.row, 2, [['']]);
    CacheService.getScriptCache().remove(PAGES_CACHE_KEY);
    audit_(ou, 'website.pages.reset', PAGES_KEY, '');
    return ok({ saved: false, updatedAt: '', updatedBy: '', pages: pagesEmpty_() }, 'Inner pages reset to their built-in text.');
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
}