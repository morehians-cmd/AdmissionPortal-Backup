/**
 * Public, read-only content for the Moreh Academy admissions landing page.
 * Only approved institutional content is returned. No applicant, student,
 * staff-account, audit, credential, or private Drive identifiers are exposed.
 *
 * Existing authenticated getAbout/getBlock/getGallery and all owner-only
 * editing functions remain unchanged.
 */
function getPublicAdmissionContent() {
  try {
    const about = aboutRead_();
    const legacyRow = blockRow_('about');
    const guideRow = blockRow_('guide');
    const facilitiesRow = blockRow_('facilities');
    const readBlock = (b, fallback) => cleanPolicy_(b.row ? String(b.sh.getRange(b.row, 2).getValue() || '') : fallback);

    // Public scholarship copy only: never include beneficiary counts or photos
    // loaded from Script Properties by the authenticated administration API.
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sch = ss.getSheetByName('Scholarships');
    const rows = sch && sch.getLastRow() >= 2
      ? sch.getRange(2, 1, sch.getLastRow() - 1, 4).getValues().map(r => ({
          Program:String(r[0] || ''), Order:parseInt(r[1], 10) || 0,
          Title:String(r[2] || '').slice(0, 150), Items:String(r[3] || '').slice(0, 2000)
        }))
      : [];
    SCH_KEYS.forEach(k => {
      if (!rows.some(r => r.Program === k)) {
        (SCH_DEFAULT[k] || []).forEach((s, i) => rows.push({
          Program:k, Order:i + 1, Title:String(s[0] || '').slice(0, 150),
          Items:String(s[1] || '').slice(0, 2000)
        }));
      }
    });
    const scholarships = SCH_KEYS.map(k => ({
      program:k,
      sections:rows.filter(r => r.Program === k)
        .sort((a, b) => a.Order - b.Order)
        .slice(0, 40)
        .map(r => ({ title:r.Title, items:r.Items }))
    }));

    // Do not send Drive IDs, leader contact details, or internal metadata.
    const publicAbout = {
      vision:about.vision,
      mission:about.mission,
      values:about.values,
      leaders:about.leaders.map(l => ({ name:l.name, title:l.title, hasPhoto:!!l.photo })),
      timeline:about.timeline
    };
    const gallery = galRead_('facilities').list.slice(0, GAL_MAX).map(x => ({ caption:x.cap }));

    const guideDefault = '<ol><li>Review the admission requirements for the intended grade level.</li><li>Create an applicant account and complete the online application.</li><li>Submit the required documents to the Admissions Office for verification.</li><li>Sign in to monitor application updates and next steps.</li></ol>';
    return ok({
      about:publicAbout,
      legacyAbout:readBlock(legacyRow, ''),
      scholarships:scholarships,
      facilitiesHtml:readBlock(facilitiesRow, ''),
      facilitiesGallery:gallery,
      enrollmentGuide:readBlock(guideRow, guideDefault)
    });
  } catch (e) { return fail(e); }
}

/** Public image read by approved About-page position; Drive IDs stay server-side. */
function getPublicAboutPhoto(index) {
  try {
    index = Number(index);
    if (!Number.isInteger(index) || index < 0 || index >= 12) throw new Error('Photo not found.');
    const leaders = aboutRead_().leaders, leader = leaders[index];
    if (!leader || !leader.photo || !inPhotoFolder_(leader.photo)) throw new Error('Photo not found.');
    const uri = photo_(leader.photo);
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(uri) || uri.length > 250000) throw new Error('Photo unavailable.');
    return ok(uri);
  } catch (e) { return fail(e); }
}

/** Public image read by approved Facilities gallery position; Drive IDs stay server-side. */
function getPublicFacilitiesPhoto(index) {
  try {
    index = Number(index);
    if (!Number.isInteger(index) || index < 0 || index >= GAL_MAX) throw new Error('Photo not found.');
    const item = galRead_('facilities').list[index];
    if (!item || !item.id || !inPhotoFolder_(item.id)) throw new Error('Photo not found.');
    const uri = photo_(item.id);
    if (!/^data:image\/jpeg;base64,/i.test(uri) || uri.length > 2300000) throw new Error('Photo unavailable.');
    return ok(uri);
  } catch (e) { return fail(e); }
}
