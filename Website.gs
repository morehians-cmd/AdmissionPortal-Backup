/**
 * Website.gs — "Website Management": edit the public homepage from the portal.
 *
 * Homepage.html already calls getPublishedHomepage() at boot and passes the result to
 * applyContent(), which reads a {sections:{...}} object. This file stores exactly that
 * object in the existing Content sheet (Key = 'homepage_data', beside 'about_data'),
 * so the homepage itself needs no change: when nothing is saved it keeps rendering its
 * built-in DEFAULT_HOME, and as soon as the administrator saves, the saved copy wins.
 *
 * Shape (every key optional; applyContent() ignores what it does not use):
 *   sections.masthead  { tagline, ids:[{name,short,logo,fb}] }
 *   sections.hero      { title,name,subtitle,desc,intervalMs,enroll:{label,to},discover:{label,to},slides:[url] }
 *   sections.values    { items:[{label,icon,on}] }
 *   sections.admission { title,sub,steps:[{t,d,i}] }
 *   sections.about     { heading,text,linkLabel,photo }
 *   sections.programs  { title,items:[{name,desc,on}] }
 *   sections.news      { title,items:[{title,date,summary,link}] }
 *   sections.footer    { loc,phone,email,fb,yt }
 *   sections.nav       { menus:[{ label,lead, subs:[{label,lead,icon}] }] }   (structure is fixed)
 *   sections.display   { order:[key], hidden:[key] }
 *
 * SITE_SEED_ below mirrors the homepage's own defaults, so the admin form starts from the
 * same text a visitor sees before anything is saved.
 *
 * The homepage's inner pages (About, Admissions, Academics, Campus Life, Forms, News and the
 * footer pages) live in the same sheet under Key = 'pages_data'; see the inner-pages section.
 */

const SITE_KEY = 'homepage_data', SITE_CACHE_KEY = 'site_v1', SITE_MAX = 45000;
const SITE_SECTIONS = ['admission', 'about', 'programs', 'news'];

/* ---------- sanitising: never trust what the browser posts ---------- */
const wsS_ = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, n);
const wsLink_ = v => /^(https?:\/\/|mailto:|#|route:)/i.test(String(v == null ? '' : v).trim()) ? String(v).trim().slice(0, 500) : '';
const wsImg_ = v => /^https?:\/\//i.test(String(v == null ? '' : v).trim()) ? String(v).trim().slice(0, 500) : '';
const wsArr_ = (a, n) => Array.isArray(a) ? a.slice(0, n) : [];
/* An absent field keeps its built-in text, so content saved before a card existed still opens. */
const wsPick_ = (v, d, n) => v == null ? d : wsS_(v, n);

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
      email: wsS_(ft.email, 120), fb: wsLink_(ft.fb), yt: wsLink_(ft.yt)
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

/* ---------- the built-in content (mirrors Homepage.html's DEFAULT_HOME) ---------- */
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
      yt: 'https://youtube.com/'
    },
    display: { order: ['admission', 'about', 'programs', 'news'], hidden: [] }
  }
};

/* ---------- storage ---------- */
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

/** Build the homepage news feed from the Campus Bulletin source of truth.
 * Legacy homepage.news.items is retained for backwards compatibility, but once bulletin
 * posts exist they become the public homepage feed instead of requiring duplicate entry. */
function siteAboutPreview_() {
  try {
    const a = aboutRead_();
    const heading = (a.vision && a.vision.title) || (a.mission && a.mission.title) || '';
    const text = (a.mission && a.mission.text) || (a.vision && a.vision.text) || '';
    return { heading: heading, text: text, linkLabel: 'Learn More', photo: '' };
  } catch (_) {
    return null;
  }
}

function siteNews_() {
  try {
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const rows = evRows_().filter(e => e.EventDate >= today);
    return rows
      .filter(e => e.Category === 'Announcement' || e.Category !== 'Announcement')
      .sort((a, b) => (a.EventDate + a.EventTime).localeCompare(b.EventDate + b.EventTime))
      .slice(0, 6)
      .map(e => ({
        title: e.Title,
        date: e.EventDate,
        summary: e.Details || (e.Category === 'Announcement' ? 'School announcement from Moreh Academy.' : 'Upcoming Moreh Academy event.'),
        link: e.Category === 'Announcement' ? 'route:news/school-announcements' : 'route:news/upcoming-events'
      }));
  } catch (_) {
    return [];
  }
}

/** PUBLIC. Homepage.html calls this at boot and passes the result straight to applyContent(),
 *  so it must return the content itself — not an ok() wrapper. null = use the built-in defaults. */
function getPublishedHomepage() {
  try {
    const d = siteRead_();
    if (!d) return null;
    const liveAbout = siteAboutPreview_();
    if (liveAbout) d.sections.about = Object.assign({}, d.sections.about || {}, liveAbout);
    const liveNews = siteNews_();
    if (liveNews.length) d.sections.news = Object.assign({}, d.sections.news || {}, { items: liveNews });
    return d;
  } catch (e) { return null; }
}

/** PUBLIC. The homepage's draft preview reads the same saved copy. */
function getDraftHomepage() { return getPublishedHomepage(); }

/* ---------- inner pages (About, Admissions, Academics, Campus Life, Forms, News) ----------
 * Same Content-sheet pattern as the homepage, under Key = 'pages_data'. Each value is the block
 * list Homepage.html's blocksHtml() already renders, written here from plain text:
 *   "## Heading"          -> { type:'h2' }
 *   "![alt](https://…)"   -> { type:'img' }
 *   any other lines       -> one { type:'p' }  (blank lines separate paragraphs; **bold**,
 *                                                *italic*, [label](url) and "- " bullets work)
 */

/* Mirrors Homepage.html's DEFAULT_HOME.nav: same labels, same order, same slugs (route ids).
 * noRoot groups have no page of their own (Contact, Terms and Privacy are reached from the footer). */
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
    ['contact', 'Contact Information'],
    ['terms', 'Terms of Service']] }
];
const PAGES_KEY = 'pages_data', PAGES_CACHE_KEY = 'pages_v1', PAGE_TEXT_MAX = 6000, PAGES_MAX = 45000;
/* A menu page's route is "<menu>/<slug>", exactly what Homepage.html's links and cur_route() use. */
const pageRoute_ = (g, s) => g.noRoot ? s[0] : g.id + '/' + s[0];
const PAGES_ROUTES_ = [];
PAGE_MENU_.forEach(g => { if (!g.noRoot) PAGES_ROUTES_.push(g.id); g.subs.forEach(s => PAGES_ROUTES_.push(pageRoute_(g, s))); });

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

/* ---------- administrator endpoints ---------- */
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
