/** Media usage map for the centralized library. */
function siteMediaUsage_(){
  const use={},add=(id,label)=>{if(!id||!label)return;(use[id]||(use[id]=[])).indexOf(label)<0&&use[id].push(label)};
  const site=siteRead_(),sections=site?site.sections:siteClean_(SITE_SEED_);
  const hero=Array.isArray(sections.hero&&sections.hero.slides)?sections.hero.slides.filter(Boolean):[];
  hero.forEach((url,i)=>add('hero-'+(i+1),'Homepage Hero'+(i+1?' · Slide '+(i+1):'')));
  if(sections.about&&sections.about.photo&&/^gallery:/i.test(sections.about.photo)){const m=sections.about.photo.match(/^gallery:([^:]+):(.+)$/);if(m)add('gallery-'+m[1]+'-'+m[2],'Homepage About');}
  try{const pages=pagesRead_();Object.keys((pages&&pages.pages)||{}).forEach(route=>{(pages.pages[route]||[]).forEach(b=>{if(b&&b.type==='img'&&/^gallery:/i.test(String(b.url||''))){const m=String(b.url).match(/^gallery:([^:]+):(.+)$/);if(m)add('gallery-'+m[1]+'-'+m[2],'Inner Page · '+route);}});});}catch(_){}
  try{GAL_PAGES.forEach(page=>{galRead_(page).list.forEach(p=>add('gallery-'+page+'-'+p.id,page==='facilities'?'Facilities Gallery':'Cluster Guide Gallery'));});}catch(_){}
  return use;
}

function mediaInventory_(){
  const site=siteRead_(),sections=site?site.sections:siteClean_(SITE_SEED_),meta=mediaMetaRead_(),usage=siteMediaUsage_(),out=[];
  const hero=Array.isArray(sections.hero&&sections.hero.slides)?sections.hero.slides.filter(Boolean):[];
  hero.forEach((url,i)=>{const id='hero-'+(i+1),m=meta[id]||{};out.push({id:id,type:'image',title:m.title||'Homepage Hero '+(i+1),alt:m.alt||'Moreh Academy homepage hero image '+(i+1),caption:m.caption||'',url:String(url),source:'Homepage Hero',page:'homepage',usedOn:usage[id]||[],editable:true});});
  if(sections.about&&sections.about.photo){const ref=String(sections.about.photo),id=/^gallery:/i.test(ref)?'gallery-'+ref.split(':')[1]+'-'+ref.split(':').slice(2).join(':'):'about-1',m=meta[id]||{};out.push({id:id,type:'image',title:m.title||'Homepage About image',alt:m.alt||'Moreh Academy students',caption:m.caption||'',url:/^https?:\\/\\//i.test(ref)?ref:'',source:'Homepage About',page:'homepage',refId:/^gallery:/i.test(ref)?ref.split(':').slice(2).join(':'):'',usedOn:usage[id]||[],editable:true});}
  GAL_PAGES.forEach(page=>{try{galRead_(page).list.forEach(p=>{const id='gallery-'+page+'-'+p.id,m=meta[id]||{};out.push({id:id,type:'image',title:m.title||p.cap||'Untitled photo',alt:m.alt||p.cap||'Moreh Academy '+page+' photo',caption:m.caption||p.cap||'',url:'',source:page==='facilities'?'Facilities':'Cluster Guide',page:page,refId:p.id,usedOn:usage[id]||[],editable:true});});}catch(_){} });
  return {items:out};
}