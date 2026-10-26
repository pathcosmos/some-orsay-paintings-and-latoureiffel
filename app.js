'use strict';
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const orsay = WORKS.filter(work => work.group !== '에펠탑');
const viewer = $('viewer'), lightbox = $('lightbox');
let filter = 'all', query = '', current = -1, sequence = WORKS, opener = null, toastTimer, startX = 0, startY = 0, touchStarted = false, pendingBack = false;
const imagePath = (work, folder = 'web') => `${folder}/${work.id}.${folder === 'lossless' ? 'png' : 'jpg'}`;
const responsiveSet = work => [320,480,800,1200].map(width => `responsive/${work.id}-${width}.webp ${width}w`).join(', ');
function gallerySizes() {
  return $('gallery').classList.contains('reading')
    ? '(max-width: 760px) calc((100vw - 55px) * .4444 - 24px), (max-width: 1100px) calc((100vw - 84px) / 2 - 24px), min(300px, calc((100vw - 180px) / 4 - 24px))'
    : '(max-width: 380px) calc((100vw - 90px) / 2), (max-width: 760px) calc((100vw - 102px) / 2), (max-width: 1100px) calc((100vw - 104px) / 3 - 44px), min(388px, calc((100vw - 168px) / 3 - 44px))';
}
function galleryImage(work) {
  return `<picture><source type="image/webp" srcset="${responsiveSet(work)}" sizes="${gallerySizes()}"><img src="${imagePath(work,'thumbs')}" alt="${escapeHTML(work.title)} — ${escapeHTML(work.artist)} 현장 촬영" width="600" height="600" loading="lazy" decoding="async"></picture>`;
}
function filteredWorks() {
  const term = query.trim().normalize('NFC').toLocaleLowerCase();
  return orsay.filter(work => (filter === 'all' || work.group === filter) && `${work.title} ${work.artist} ${work.latin} ${work.original} ${work.year}`.normalize('NFC').toLocaleLowerCase().includes(term));
}
function renderGallery() {
  const visible = filteredWorks();
  $('gallery').innerHTML = visible.map(work => `<article class="art-card"><button class="art-open" data-open="${work.id}" aria-label="${escapeHTML(work.title)} 상세 보기"><span class="art-frame">${galleryImage(work)}<span class="open-icon" aria-hidden="true">↗</span></span><div class="art-caption"><span class="artist">${escapeHTML(work.artist)}</span><h3>${escapeHTML(work.title)}</h3><span class="year">${escapeHTML(work.year)}${work.provisional ? ' · 작가·작품명 미확인' : work.attributionUncertain ? ' · 작가 귀속 불확실' : ''}</span></div></button><p class="card-description">${escapeHTML(work.description)}</p></article>`).join('');
  $('result-count').textContent = `회화 ${visible.length}점${visible.length !== orsay.length ? ` / 전체 ${orsay.length}점` : ' · 직접 촬영한 기록'}`;
  $('empty').hidden = visible.length > 0;
}
function renderStrip() {
  $('filmstrip').innerHTML = sequence.map(work => `<button data-open="${work.id}" aria-label="${escapeHTML(work.title)}" ${work.id === WORKS[current].id ? 'class="active" aria-current="true"' : ''}><picture><source type="image/webp" srcset="responsive/${work.id}-160.webp"><img src="${imagePath(work,'thumbs')}" alt="" loading="lazy" width="42" height="46"></picture></button>`).join('');
  $('filmstrip').querySelector('.active')?.scrollIntoView({block:'nearest',inline:'center',behavior:'instant'});
}
function resetZoom() {
  $('viewer-stage').classList.remove('zoomed');
  $('zoom').setAttribute('aria-pressed','false');
  $('zoom').textContent = '확대';
  $('viewer-stage').scrollTo(0,0);
}
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./,''); } catch { return url; } };
function renderDetail(work) {
  const detail = typeof DETAILS === 'undefined' ? null : DETAILS[work.id];
  const facts = $('viewer-facts'), body = $('viewer-body'), refs = $('viewer-refs');
  facts.hidden = !detail;
  facts.innerHTML = detail ? detail.meta.map(([key,value]) => `<dt>${escapeHTML(key)}</dt><dd>${escapeHTML(value)}</dd>`).join('') : '';
  body.innerHTML = detail?.body.length ? `<h3>작품 해설</h3>${detail.body.map(text => `<p>${escapeHTML(text)}</p>`).join('')}` : '';
  refs.hidden = !detail?.refs.length;
  refs.innerHTML = detail?.refs.length ? `참고 · ${detail.refs.map(url => `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(hostOf(url))}</a>`).join(' · ')}` : '';
}
function showWork(id, updateURL = true) {
  const index = WORKS.findIndex(work => work.id === id);
  if (index < 0) return;
  current = index;
  const work = WORKS[current];
  if (!sequence.some(item => item.id === id)) sequence = WORKS;
  resetZoom();
  $('viewer-image').src = imagePath(work);
  $('viewer-image').alt = `${work.title} — ${work.artist}, 직접 촬영`;
  if (lightbox.open) syncLightbox(work);
  $('viewer-title').textContent = work.title;
  $('viewer-artist').textContent = `${work.artist} / ${work.latin}`;
  $('viewer-original').textContent = work.original;
  $('viewer-meta').textContent = `${work.year} · ${work.group === '에펠탑' ? 'Paris, France' : 'Musée d’Orsay'} · ${work.id}`;
  $('viewer-description').textContent = work.description;
  renderDetail(work);
  $('viewer-look').textContent = work.look;
  $('viewer-certainty').hidden = !(work.provisional || work.attributionUncertain);
  $('viewer-certainty').textContent = work.certainty || '작가와 작품명을 확인하지 못했습니다. 제목은 화면에 보이는 모습을 설명한 임시 제목이며, 확인하지 못한 작가·제작연도는 확정 정보로 표시하지 않았습니다.';
  $('viewer-source').href = work.source;
  $('viewer-source').textContent = work.source === ORSAY_SOURCE ? '오르세 공식 컬렉션에서 찾아보기 ↗' : work.source.includes('musee-orsay.fr') ? '오르세 소장품 기록 ↗' : '해설 참고 자료 확인 ↗';
  $('download-jpg').href = imagePath(work,'jpg');
  $('download-png').href = imagePath(work,'lossless');
  const position = sequence.findIndex(item => item.id === id);
  $('viewer-count').textContent = `${String(position+1).padStart(2,'0')} / ${String(sequence.length).padStart(2,'0')}`;
  document.title = `${work.title} — 빛을 따라, 파리`;
  $('viewer-info')?.scrollTo(0,0);
  document.querySelector('.viewer-body').scrollTo(0,0);
  renderStrip();
  if (updateURL) history.replaceState({...history.state,work:id},'',`#photo=${id}`);
  const connection = navigator.connection;
  const preloadAdjacent = matchMedia('(min-width: 761px)').matches && !connection?.saveData && !/^(slow-)?2g$/.test(connection?.effectiveType || '');
  for (const offset of preloadAdjacent ? [-1,1] : []) {
    const adjacent = sequence[(position+offset+sequence.length)%sequence.length];
    const preload = new Image(); preload.src = imagePath(adjacent);
  }
}
// 사진을 눌러 여는 전체 화면 모달. 상세 화면 위에 겹쳐 열리며 같은 순서로 넘길 수 있다.
function syncLightbox(work) {
  $('lightbox-image').src = imagePath(work);
  $('lightbox-image').alt = `${work.title} — ${work.artist}, 직접 촬영`;
}
function openLightbox() {
  if (current < 0 || $('viewer-stage').classList.contains('zoomed')) return;
  syncLightbox(WORKS[current]);
  lightbox.showModal();
  $('lightbox-close').focus({preventScroll:true});
}
function openWork(id, fromURL = false) {
  if (pendingBack) return;
  if (!viewer.open) {
    opener = document.activeElement;
    sequence = WORKS;
    if (!fromURL) history.pushState({photoViewer:true},'',`#photo=${id}`);
    viewer.showModal();
  }
  showWork(id,!fromURL);
  if (!fromURL) $('close-viewer').focus({preventScroll:true});
}
function finishClose() {
  if (!viewer.open) return;
  if (lightbox.open) lightbox.close();
  viewer.close();
  resetZoom();
  document.title = '빛을 따라, 파리 — Orsay & Eiffel';
  if (document.fullscreenElement === viewer) document.exitFullscreen().catch(()=>{});
  if (opener?.isConnected) opener.focus({preventScroll:true});
}
function closeWork() {
  finishClose();
  if (history.state?.photoViewer) { pendingBack = true; history.back(); }
  else history.replaceState(null,'',location.pathname+location.search+'#collection');
}
function step(direction) {
  const position = sequence.findIndex(work => work.id === WORKS[current]?.id);
  const next = sequence[(position+direction+sequence.length)%sequence.length];
  if(next) showWork(next.id);
}
function handleHash() {
  pendingBack = false;
  const match = /^#photo=(IMG_\d+)$/.exec(location.hash);
  if (match && WORKS.some(work => work.id === match[1])) openWork(match[1],true);
  else finishClose();
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-open]');
  if (button) openWork(button.dataset.open);
});
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click',()=>{
  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item=>{const selected=item===button;item.classList.toggle('active',selected);item.setAttribute('aria-pressed',String(selected));});
  renderGallery();
}));
$('search').addEventListener('input', event => {query=event.target.value;renderGallery();});
$('reset-search').addEventListener('click',()=>{query='';$('search').value='';document.querySelector('[data-filter="all"]').click();$('search').focus();});
document.querySelectorAll('[data-layout]').forEach(button=>button.addEventListener('click',()=>{
  $('gallery').classList.toggle('reading',button.dataset.layout==='reading');
  $('gallery').querySelectorAll('source').forEach(source => { source.sizes = gallerySizes(); });
  document.querySelectorAll('[data-layout]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});
}));
$('close-viewer').addEventListener('click',closeWork);
$('viewer-image').addEventListener('click',openLightbox);
$('viewer-image').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openLightbox();}});
lightbox.addEventListener('click',event=>{if(!event.target.closest('.lightbox-nav'))lightbox.close();});
$('lightbox-previous').addEventListener('click',()=>step(-1));$('lightbox-next').addEventListener('click',()=>step(1));
viewer.addEventListener('cancel', event=>{event.preventDefault();closeWork();});
$('previous').addEventListener('click',()=>step(-1));$('next').addEventListener('click',()=>step(1));
document.addEventListener('keydown',event=>{
  if(!viewer.open || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
  if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}
  if(event.key==='ArrowRight'){event.preventDefault();step(1);}
});
$('zoom').addEventListener('click',()=>{
  const zoomed=$('viewer-stage').classList.toggle('zoomed');
  $('zoom').textContent=zoomed?'축소':'확대';$('zoom').setAttribute('aria-pressed',String(zoomed));
});
if (!viewer.requestFullscreen) $('fullscreen').hidden=true;
$('fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await viewer.requestFullscreen();}
  catch {toast('이 브라우저에서는 전체 화면을 사용할 수 없습니다.');}
});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'화면 복원':'전체 화면';});
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
$('copy-link').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(location.href);toast('사진 링크를 복사했습니다.');}
  catch{toast('주소창의 링크를 복사해 주세요.');}
});
$('viewer-stage').addEventListener('touchstart',event=>{
  touchStarted=event.touches.length===1&&!$('viewer-stage').classList.contains('zoomed');
  if(touchStarted){startX=event.touches[0].clientX;startY=event.touches[0].clientY;}
},{passive:true});
$('viewer-stage').addEventListener('touchend',event=>{
  if(!touchStarted)return;touchStarted=false;
  const dx=event.changedTouches[0].clientX-startX,dy=event.changedTouches[0].clientY-startY;
  if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)step(dx<0?1:-1);
},{passive:true});
$('viewer-stage').addEventListener('touchcancel',()=>{touchStarted=false;},{passive:true});
$('viewer-image').addEventListener('error',()=>{toast('사진을 불러오지 못했습니다. 연결을 확인해 주세요.');});
window.addEventListener('popstate',handleHash);
window.addEventListener('hashchange',()=>{if(!pendingBack)handleHash();});
renderGallery();handleHash();
