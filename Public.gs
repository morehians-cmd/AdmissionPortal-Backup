/*****************************************************************************
 MOREH ACADEMY PORTAL - PUBLIC HOMEPAGE ENDPOINTS (new file "Public")
 Read-only, no sign-in. Returns only content meant for the public: no learner data, no counts.
 Needs (already in your project): blockRow_, cleanPolicy_, evRows_, galRead_, photo_, activeSY_, ok, fail.
 Deploy the web app with "Who has access: Anyone" so visitors can open the homepage.
*****************************************************************************/

/** One editable text block from the Content sheet, sanitised with the privacy-policy allow-list. */
function pubBlock_(key) {
  try { const b = blockRow_(key); return b.row ? cleanPolicy_(String(b.sh.getRange(b.row, 2).getValue() || '')) : ''; }
  catch (e) { return ''; }
}

/** PUBLIC. Everything the homepage needs in one call, cached for 10 minutes. */
function getPublicContent() {
  try {
    const cache = CacheService.getScriptCache(), hit = cache.get('pubc_v1');
    if (hit) return JSON.parse(hit);
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const out = ok({
      portal: ScriptApp.getService().getUrl() + '?portal=1',
      sy: activeSY_(),
      about: pubBlock_('about'),
      guide: pubBlock_('guide'),
      events: evRows_().filter(e => e.EventDate >= today).sort((a, b) => (a.EventDate + a.EventTime).localeCompare(b.EventDate + b.EventTime)).slice(0, 3)
        .map(e => ({ t: e.Title, d: e.EventDate, v: e.Venue, c: e.Category })),
      gallery: galRead_('facilities').list.slice(0, 12)
    });
    try { cache.put('pubc_v1', JSON.stringify(out), 600); } catch (_) {}
    return out;
  } catch (e) { return fail(e); }
}

/** PUBLIC. One Facilities photo as a data URI. Only ids on the Facilities gallery list are served. */
function getPublicPhoto(id) {
  try {
    if (!galRead_('facilities').list.some(x => x.id === String(id))) throw new Error('Not found.');
    return ok(photo_(String(id)));
  } catch (e) { return fail(e); }
}