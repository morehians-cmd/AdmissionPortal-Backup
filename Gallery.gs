/*****************************************************************************
 MOREH ACADEMY PORTAL - GALLERY (add as a NEW file named "Gallery" in the Apps Script project)
 Photo galleries for the Facilities & Campus Tour and Senior High Cluster Guide pages.

 Requires the existing: blockRow_ (Content file), put_, who_, owner_, ok, fail, audit_, photo_, PHOTO_FOLDER_ID.
 This is SERVER code only. Do not paste any of the Index.html code into this file.

 Design
   - Photos are stored as JPEGs in your existing PHOTO_FOLDER_ID Drive folder (same place as scholarship photos).
   - The list of photos per page (id + caption) is stored as JSON in the Content sheet under the key gal_<page>.
   - The browser first gets only the list, then loads photos one at a time, so the page opens quickly.
   - Any signed-in user can view. Only the main administrator (Clearance = Full) can add, caption or remove.
   - getGalleryPhoto only serves ids that are on that page's list, so it cannot be used to read other Drive files.
*****************************************************************************/

const GAL_PAGES = ['facilities', 'cluster', 'handbook'];     // add 'about' or 'handbook' here later to enable galleries on those pages
const GAL_MAX = 12;                              // photos per page
const GAL_MAX_B64 = 2200000;                     // ~1.6 MB of image data after base64

const galKey_ = page => { page = String(page || ''); if (!GAL_PAGES.includes(page)) throw new Error('Unknown page.'); return 'gal_' + page; };
const galCap_ = s => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

/** Reads the list for a page: { b: block row handle, list: [{id, cap}] }. */
function galRead_(page) {
  const b = blockRow_(galKey_(page)); let L = [];
  if (b.row) { try { L = JSON.parse(String(b.sh.getRange(b.row, 2).getValue() || '[]')); } catch (_) { L = []; } }
  return { b:b, list:(Array.isArray(L) ? L : []).filter(x => x && typeof x.id === 'string' && x.id).map(x => ({ id:x.id, cap:galCap_(x.cap) })) };
}
function galWrite_(page, b, list) { put_(b.sh, b.row || (b.sh.getLastRow() + 1), 1, [[galKey_(page), JSON.stringify(list)]]); }

/** Any signed-in user. Returns [{id, cap}] (no image data). */
function getGallery(token, page) {
  try { who_(token); return ok(galRead_(page).list); } catch (e) { return fail(e); }
}

/** Any signed-in user. Returns one photo as a data URI, only if it belongs to this page's gallery. */
function getGalleryPhoto(token, page, id) {
  try {
    who_(token);
    if (!galRead_(page).list.some(x => x.id === String(id))) throw new Error('Photo not found.');
    return ok(photo_(String(id)));
  } catch (e) { return fail(e); }
}

/** OWNER ONLY. dataUrl must be a JPEG data URI (the browser resizes and converts before sending). */
function addGalleryPhoto(token, page, dataUrl, caption) {
  const lock = LockService.getScriptLock(); let fid = '', saved = false;
  try {
    lock.waitLock(20000);
    const ou = owner_(token), g = galRead_(page);
    if (g.list.length >= GAL_MAX) throw new Error('This page already has ' + GAL_MAX + ' photos. Remove one first.');
    const parts = String(dataUrl || '').split(',');
    if (parts.length < 2 || !/^data:image\/jpeg;base64$/i.test(parts[0])) throw new Error('Photo must be a JPEG image.');
    if (parts[1].length > GAL_MAX_B64) throw new Error('Photo is too large (limit about 1.5 MB).');
    const bytes = Utilities.base64Decode(parts[1]);
    if (!bytes.length || !((bytes[0] & 255) === 0xFF && (bytes[1] & 255) === 0xD8)) throw new Error('Photo must be a JPEG image.');   // bytes are signed in Apps Script
    const f = DriveApp.getFolderById(PHOTO_FOLDER_ID).createFile(Utilities.newBlob(bytes, 'image/jpeg', 'gallery_' + page + '_' + Date.now() + '.jpg'));
    fid = f.getId();
    g.list.push({ id:fid, cap:galCap_(caption) });
    galWrite_(page, g.b, g.list); saved = true;
    audit_(ou, 'gallery.add', page, fid);
    return ok({ id:fid, list:g.list }, 'Photo added');
  } catch (e) {
    if (fid && !saved) { try { DriveApp.getFileById(fid).setTrashed(true); } catch (_) {} }   // do not leave an orphan file
    return fail(e);
  } finally { try { lock.releaseLock(); } catch (_) {} }
}

/** OWNER ONLY. */
function setGalleryCaption(token, page, id, caption) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ou = owner_(token), g = galRead_(page), p = g.list.find(x => x.id === String(id));
    if (!p) throw new Error('Photo not found.');
    p.cap = galCap_(caption); galWrite_(page, g.b, g.list);
    audit_(ou, 'gallery.caption', page, p.id);
    return ok(g.list, 'Caption saved');
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
}

/** OWNER ONLY. Removes the photo from the page, then moves the Drive file to the trash. */
function removeGalleryPhoto(token, page, id) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ou = owner_(token), g = galRead_(page), i = g.list.findIndex(x => x.id === String(id));
    if (i < 0) throw new Error('Photo not found.');
    const gone = g.list.splice(i, 1)[0];
    galWrite_(page, g.b, g.list);                                              // update the list first
    try { DriveApp.getFileById(gone.id).setTrashed(true); } catch (_) {}      // then trash the file
    audit_(ou, 'gallery.remove', page, gone.id);
    return ok(g.list, 'Photo removed');
  } catch (e) { return fail(e); } finally { try { lock.releaseLock(); } catch (_) {} }
}