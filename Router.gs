/**
 * Router.gs — single entry point for the merged portal.
 *
 *  (no page)            → Homepage.html   (public site, from New AP)
 *  ?page=portal         → Index.html      (admission portal, Old AP — unchanged design)
 *  ?page=portal&reg=1   → Homepage.html with the Create-an-Account pop-up open (the portal has no sign-in screen of its own)
 *  ?signin=1 / ?reg=1 / ?reg=current → Homepage.html with the Sign-in / Create-an-Account / Current-student-account pop-up open
 *  any other ?page=...  → Homepage.html, which renders that website page client-side
 *
 * Template variables provided to every page:
 *  baseUrl, page, preview, ticket, reg
 * Apps Script evaluates a template's scriptlets only in the file it is rendering, so the
 * variables below are supplied to whichever file is served.
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const requested = String(p.page || 'home').toLowerCase();
  const page = /^[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(requested) ? requested : 'home';
  const open = String(p.signin || '') === '1' ? 'signin' : String(p.reg || '') === 'current' ? 'current' : String(p.reg || '') === '1' ? 'create' : '';
  const portal = page === 'portal' && open !== 'create' && open !== 'current';       // Create-account links always land on the homepage
  const file = portal ? 'Index' : 'Homepage';
  const t = HtmlService.createTemplateFromFile(file);

  t.baseUrl = ScriptApp.getService().getUrl();
  t.page = page === 'portal' ? 'home' : page;
  t.open = portal ? '' : open;
  t.preview = (p.preview === 'draft') ? 'draft' : '';
  t.ticket = /^[A-Za-z0-9-]{36}$/.test(String(p.pt || '')) ? String(p.pt) : '';

  const out = t.evaluate()
    .setTitle(portal ? 'Moreh Academy Portal' : 'Moreh Academy')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');

  // The portal is a standalone app; the public site may be embedded/previewed.
  out.setXFrameOptionsMode(portal ? HtmlService.XFrameOptionsMode.DEFAULT : HtmlService.XFrameOptionsMode.ALLOWALL);
  return out;
}

/** Template partials only. Fixed whitelist — never an arbitrary file name. */
const INCLUDE_ALLOWED_ = ['PipelineView', 'TlcPortal'];
function include(f) {
  if (INCLUDE_ALLOWED_.indexOf(String(f)) < 0) throw new Error('Unknown template partial.');
  return HtmlService.createHtmlOutputFromFile(String(f)).getContent();
}