/**
 * MOREH ACADEMY - WEBSITE MEDIA LIBRARY
 * Centralized website-only image storage. Uses a dedicated child folder inside the
 * existing school photo root; does not alter gallery/scholarship/photo records.
 * Metadata is stored in the Content sheet under MEDIA_LIBRARY_KEY.
 * Uploads are private in Drive. Images are served through scoped portal functions.
 */
const MEDIA_LIBRARY_KEY = 'website_media_library_v1';
const MEDIA_LIBRARY_FOLDER_NAME = 'Moreh Academy Website Media';
const MEDIA_CATEGORIES = ['hero','logos','institutional','programs','news','facilities','gallery','pages','other'];
const MEDIA_MAX_BYTES = 3 * 1024 * 1024;
const MEDIA_MAX_RECORDS = 500;
const MEDIA_ALLOWED_TYPES = ['image/jpeg','image/png','image/webp'];


function mediaFolder_() {
  const root = DriveApp.getFolderById(PHOTO_FOLDER_ID);
  const it = root.getFoldersByName(MEDIA_LIBRARY_FOLDER_NAME);
  return it.hasNext() ? it.next() : root.createFolder(MEDIA_LIBRARY_FOLDER_NAME);
}
function mediaStore_() {
  const b = blockRow_(MEDIA_LIBRARY_KEY); let items=[];
  if (b.row) { try { items=JSON.parse(String(b.sh.getRange(b.row,2).getValue()||'[]')); } catch (_) { items=[]; } }
  return { b:b, items:Array.isArray(items)?items.filter(x=>x&&/^[A-Za-z0-9_-]{10,80}$/.test(String(x.id||''))):[] };
}
function mediaCleanName_(name) {
  return String(name||'image').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').trim().slice(0,120) || 'image';
}
function mediaCleanText_(v,max) { return String(v==null?'':v).replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max); }
function mediaCleanCategory_(v) { v=String(v||'other'); return MEDIA_CATEGORIES.includes(v)?v:'other'; }
function mediaWrite_(b,items) { put_(b.sh,b.row||(b.sh.getLastRow()+1),1,[[MEDIA_LIBRARY_KEY,JSON.stringify(items)]]); }
function mediaPublicRecord_(m) { return {id:m.id,name:m.name,category:m.category,alt:m.alt||'',createdAt:m.createdAt||'',archived:!!m.archived,usedIn:Array.isArray(m.usedIn)?m.usedIn:[]}; }

/** Owner/admin only. Returns active and archived media metadata without image bytes. */
function getWebsiteMediaLibrary(token) {
  try { owner_(token); const s=mediaStore_(); return ok(s.items.map(mediaPublicRecord_)); } catch(e) { return fail(e); }
}
/** Owner/admin only. Uploads JPEG, PNG or WebP; signature is checked, file size capped at 3 MB. */
function uploadWebsiteMedia(token,dataUrl,filename,category,alt) {
  const lock=LockService.getScriptLock(); let fileId='';
  try {
    lock.waitLock(20000); const ou=owner_(token), s=mediaStore_();
    if(s.items.length>=MEDIA_MAX_RECORDS) throw new Error('Media Library limit reached. Archive or remove old items first.');
    const parts=String(dataUrl||'').split(','); if(parts.length!==2) throw new Error('Invalid image upload data.');
    const match=parts[0].match(/^data:(image\/(?:jpeg|png|webp));base64$/i); if(!match) throw new Error('Upload a JPEG, PNG or WebP image.');
    const mime=match[1].toLowerCase(); const bytes=Utilities.base64Decode(parts[1]);
    if(!bytes.length||bytes.length>MEDIA_MAX_BYTES) throw new Error('Image must be smaller than 3 MB.');
    const b0=bytes[0]&255,b1=bytes[1]&255,b2=bytes[2]&255,b3=bytes[3]&255;
    const jpeg=mime==='image/jpeg'&&b0===255&&b1===216&&b2===255;
    const png=mime==='image/png'&&b0===137&&b1===80&&b2===78&&b3===71;
    const webp=mime==='image/webp'&&b0===82&&b1===73&&b2===70&&b3===70&&((bytes[8]&255)===87)&&((bytes[9]&255)===69)&&((bytes[10]&255)===66)&&((bytes[11]&255)===80);
    if(!(jpeg||png||webp)) throw new Error('Image file signature does not match its type.');
    const name=mediaCleanName_(filename), blob=Utilities.newBlob(bytes,mime,name);
    const f=mediaFolder_().createFile(blob); fileId=f.getId();
    const record={id:fileId,name:name,mime:mime,size:bytes.length,category:mediaCleanCategory_(category),alt:mediaCleanText_(alt,240),createdAt:new Date().toISOString(),archived:false,usedIn:[]};
    s.items.unshift(record); mediaWrite_(s.b,s.items); audit_(ou,'website.media.upload',record.category,fileId);
    return ok(mediaPublicRecord_(record),'Image uploaded to Website Media Library.');
  } catch(e) { if(fileId) try { DriveApp.getFileById(fileId).setTrashed(true); } catch(_){} return fail(e); }
  finally { try { lock.releaseLock(); } catch(_){} }
}
/** Owner/admin only. Updates category, alt text and display name. */
function updateWebsiteMedia(token,id,changes) {
  const lock=LockService.getScriptLock(); try { lock.waitLock(20000); const ou=owner_(token),s=mediaStore_(),i=s.items.findIndex(x=>x.id===String(id)); if(i<0) throw new Error('Media item not found.');
    const c=changes||{},m=s.items[i]; if(c.name!=null)m.name=mediaCleanName_(c.name); if(c.category!=null)m.category=mediaCleanCategory_(c.category); if(c.alt!=null)m.alt=mediaCleanText_(c.alt,240);
    const f=DriveApp.getFileById(m.id); if(c.name!=null) f.setName(m.name); mediaWrite_(s.b,s.items); audit_(ou,'website.media.update',m.category,m.id); return ok(mediaPublicRecord_(m),'Media details updated.');
  } catch(e){return fail(e);} finally{try{lock.releaseLock();}catch(_){}}
}
/** Owner/admin only. Archive is reversible; archived images cannot be selected for new assignments. */
function archiveWebsiteMedia(token,id,archived) {
  const lock=LockService.getScriptLock(); try { lock.waitLock(20000); const ou=owner_(token),s=mediaStore_(),m=s.items.find(x=>x.id===String(id)); if(!m) throw new Error('Media item not found.'); m.archived=archived===true; mediaWrite_(s.b,s.items); audit_(ou,m.archived?'website.media.archive':'website.media.restore',m.category,m.id); return ok(mediaPublicRecord_(m),m.archived?'Media archived.':'Media restored.'); }
  catch(e){return fail(e);} finally{try{lock.releaseLock();}catch(_){}}
}
/** Owner/admin only. Records where a website section uses the image; keeps this metadata in sync on assignment. */
function setWebsiteMediaUsage(token,id,section,used) {
  const lock=LockService.getScriptLock(); try { lock.waitLock(20000); const ou=owner_(token),s=mediaStore_(),m=s.items.find(x=>x.id===String(id)); if(!m||m.archived) throw new Error('Active media item not found.'); section=mediaCleanText_(section,80); if(!section) throw new Error('Section name is required.'); m.usedIn=Array.isArray(m.usedIn)?m.usedIn:[]; if(used===true&&!m.usedIn.includes(section))m.usedIn.push(section); if(used!==true)m.usedIn=m.usedIn.filter(x=>x!==section); mediaWrite_(s.b,s.items); audit_(ou,'website.media.usage',section,m.id); return ok(mediaPublicRecord_(m)); }
  catch(e){return fail(e);} finally{try{lock.releaseLock();}catch(_){}}
}
/** Admin preview. Image is served only if the ID is indexed in this library. */
function getWebsiteMediaPhoto(token,id) {
  try { owner_(token); const s=mediaStore_(),m=s.items.find(x=>x.id===String(id)); if(!m) throw new Error('Media item not found.'); const uri=photo_(m.id); if(!uri) throw new Error('Image could not be read.'); return ok(uri); } catch(e){return fail(e);}
}
/** Public rendering endpoint: only explicitly referenced, active items are served. */
function getPublishedWebsiteMediaPhoto(id) {
  try { const s=mediaStore_(),m=s.items.find(x=>x.id===String(id)); if(!m||m.archived||!Array.isArray(m.usedIn)||!m.usedIn.length) throw new Error('Photo not found.'); const uri=photo_(m.id); return ok(uri||''); } catch(e){return fail(e);}
}

/** Synchronize media references from the published homepage record. Called by Website.gs
 * while saving/resetting the homepage so public media are served only when referenced.
 * References use the compact marker "media:<Drive file ID>" in image fields.
 */
function syncWebsiteMediaUsage_(sections) {
  const serialized=JSON.stringify(sections||{}), refs=new Set(), re=/media:([A-Za-z0-9_-]{10,80})/g;
  let m; while((m=re.exec(serialized))) refs.add(m[1]);
  const s=mediaStore_();
  const unknown=[]; refs.forEach(id=>{const item=s.items.find(x=>x.id===id); if(!item)unknown.push(id); else if(item.archived)unknown.push(id);});
  if(unknown.length) throw new Error('Homepage references missing or archived website media. Replace those images before publishing.');
  s.items.forEach(item=>{item.usedIn=refs.has(item.id)?['Homepage']:[];});
  mediaWrite_(s.b,s.items);
  return refs.size;
}
