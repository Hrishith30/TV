/* Simple IPTV Player - Xtream Codes API (vanilla JS) */
const $ = (id) => document.getElementById(id);
const state = {
  server: '', user: '', pass: '',
  type: 'live', cats: [], streams: [],
  activeCat: 'all', favOnly: false, query: '', catQuery: '',
  current: null, hls: null,
};
function isMobile(){ return window.matchMedia('(max-width: 820px)').matches; }
function cleanServer(u){
  u = (u||'').trim();
  if(!u) return '';
  if(!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u.replace(/\/+$/,'');
}
function apiUrl(params){
  return state.server + '/player_api.php?username=' + encodeURIComponent(state.user) + '&password=' + encodeURIComponent(state.pass) + '&' + params;
}
async function api(params){
  const target = apiUrl(params);
  // 1) Same-origin Vercel proxy (works on Vercel hosting, no checkbox needed)
  if(location.protocol.startsWith('http') && location.hostname !== ''){
    try{
      const pRes = await fetch('/api/proxy?target=' + encodeURIComponent(target));
      if(pRes.ok) return await pRes.json();
    }catch{}
  }
  // 2) Direct (works for file:// and http:// LAN use)
  try{
    const res = await fetch(target);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }catch(e){
    if(location.protocol === 'https:' && state.server.startsWith('http://'))
      throw new Error('This HTTPS site cannot reach your HTTP provider directly. Redeploy this commit on Vercel so /api/proxy handles it, or use an HTTPS host from your provider.');
    throw e;
  }
}
function streamUrl(s){
  const base = state.server;
  if(state.type==='live') return base + '/live/' + encodeURIComponent(state.user) + '/' + encodeURIComponent(state.pass) + '/' + s.stream_id + '.m3u8';
  if(state.type==='movie'){
    const ext = s.container_extension || 'mp4';
    return base + '/movie/' + encodeURIComponent(state.user) + '/' + encodeURIComponent(state.pass) + '/' + s.stream_id + '.' + ext;
  }
  return null;
}
function favKey(){ return 'iptv_fav_' + state.server + '_' + state.user; }
function getFavs(){ try{ return JSON.parse(localStorage.getItem(favKey())||'[]'); }catch{ return []; } }
function isFav(id){ return getFavs().includes(String(id)); }
function toggleFav(id){
  let f = getFavs(); id = String(id);
  f = f.includes(id) ? f.filter(x=>x!==id) : [...f, id];
  localStorage.setItem(favKey(), JSON.stringify(f));
  renderGrid();
}
async function login(){
  const err = $('loginError'); err.textContent = '';
  state.server = cleanServer($('serverUrl').value);
  state.user = $('username').value.trim();
  state.pass = $('password').value;
  if(!state.server || !state.user || !state.pass){ err.textContent = 'Please fill server, username and password.'; return; }
  $('loginBtn').textContent = 'Connecting...'; $('loginBtn').disabled = true;
  try{
    const info = await api('action=get_account_info');
    if(!info || !info.user_info || info.user_info.auth == 0) throw new Error('Invalid username / password.');
    if(info.user_info.exp_date){
      const d = new Date(info.user_info.exp_date*1000);
      $('statusBar').textContent = 'Account: ' + info.user_info.username + ' | Expires: ' + d.toLocaleDateString();
    }
    if($('remember').checked) localStorage.setItem('iptv_login', JSON.stringify({s:state.server,u:state.user,p:state.pass}));
    else localStorage.removeItem('iptv_login');
    $('loginScreen').classList.remove('active');
    $('appScreen').classList.add('active');
    if(isMobile()) closeSidebar(); else openSidebarDesktop();
    await loadSection('live');
  }catch(e){
    console.error(e);
    const msg = String((e && e.message) || e);
    err.textContent = 'Login failed: ' + msg;
  }finally{
    $('loginBtn').textContent = 'Connect & Load'; $('loginBtn').disabled = false;
  }
}
async function loadSection(type){
  state.type = type;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.type===type));
  state.activeCat = 'all'; state.query=''; $('search').value=''; state.favOnly=false; $('favBtn').textContent='☆';
  $('loader').classList.remove('hidden'); $('grid').innerHTML=''; $('statusBar').textContent='';
  $('content').scrollTop = 0;
  try{
    let catAction = type==='live'?'get_live_categories':type==='movie'?'get_vod_categories':'get_series_categories';
    let streamAction = type==='live'?'get_live_streams':type==='movie'?'get_vod_streams':'get_series';
    const [cats, streams] = await Promise.all([api('action='+catAction), api('action='+streamAction)]);
    state.cats = cats||[]; state.streams = streams||[];
    renderCats(); renderGrid();
    $('statusBar').textContent = streams.length + ' items | ' + cats.length + ' categories';
    $('loader').classList.add('hidden');
  }catch(e){
    $('loader').classList.add('hidden');
    $('statusBar').textContent = 'Load failed: ' + e.message;
  }
}
function renderCats(){
  const ul = $('catList'); ul.innerHTML='';
  const q = (state.catQuery||'').toLowerCase();
  const cats = state.cats.filter(c=>!q || (c.category_name||'').toLowerCase().includes(q));
  const mk = (id,label,active)=>{
    const li=document.createElement('li');
    const b=document.createElement('button');
    b.type='button'; b.dataset.id=id; b.textContent=label;
    if(active) b.classList.add('active');
    b.onclick=()=>{ state.activeCat=b.dataset.id; renderCats(); renderGrid(); $('content').scrollTop=0; if(isMobile()) closeSidebar(); };
    li.appendChild(b); return li;
  };
  ul.appendChild(mk('all','All ('+state.streams.length+')', state.activeCat==='all'));
  cats.forEach(c=>{
    const count = state.streams.filter(s=>String(s.category_id)===String(c.category_id)).length;
    ul.appendChild(mk(String(c.category_id), (c.category_name||'Unnamed')+' ('+count+')', String(state.activeCat)===String(c.category_id)));
  });
  if(!cats.length){ const li=document.createElement('li'); li.innerHTML='<p class="status">No categories match.</p>'; ul.appendChild(li); }
}
function filtered(){
  let list = state.streams;
  if(state.activeCat!=='all') list = list.filter(s=>String(s.category_id)===String(state.activeCat));
  if(state.favOnly){ const f=getFavs(); list=list.filter(s=>f.includes(String(s.stream_id))); }
  if(state.query){ const q=state.query.toLowerCase(); list=list.filter(s=>(s.name||'').toLowerCase().includes(q)); }
  return list.slice(0, 2000);
}
function renderGrid(){
  const grid = $('grid'); grid.innerHTML='';
  const list = filtered();
  if(!list.length){ grid.innerHTML='<p class="status">No items. Try another category or search.</p>'; return; }
  const frag = document.createDocumentFragment();
  list.forEach(s=>{
    const id = s.stream_id, name = s.name||('Channel '+id);
    const img = s.stream_icon || s.cover || '';
    const b = document.createElement('button');
    b.className='card'; b.type='button';
    const im = document.createElement('img');
    im.loading='lazy'; im.alt='';
    if(img){ im.src=img; im.onerror=()=>{ im.classList.add('noimg'); im.removeAttribute('src'); }; }
    else im.classList.add('noimg');
    const t=document.createElement('div'); t.className='t';
    const sp=document.createElement('span'); sp.textContent=name;
    const fav=document.createElement('span'); fav.className='fav'; fav.textContent=isFav(id)?'★':'☆';
    t.appendChild(sp); t.appendChild(fav);
    b.appendChild(im); b.appendChild(t);
    b.onclick=()=>openPlayer(s);
    frag.appendChild(b);
  });
  grid.appendChild(frag);
}
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function stopStream(){
  const v = $('video');
  try{ if(state.hls){ state.hls.destroy(); state.hls=null; } }catch{}
  v.pause(); v.removeAttribute('src'); v.load();
}
function playableUrl(url){
  // HTTPS site + HTTP stream = blocked; route via own Vercel proxy (rewrites HLS + ranges)
  if(location.protocol === 'https:' && /^http:\/\//i.test(url) && location.hostname !== '')
    return '/api/proxy?target=' + encodeURIComponent(url);
  return url;
}
function playUrl(url){
  stopStream();
  $('playerError').textContent='';
  const v = $('video');
  url = playableUrl(url);
  v.poster = '';
  if(url.includes('.m3u8') && window.Hls && Hls.isSupported()){
    const hls = new Hls({maxBufferLength:30, fragLoadingMaxRetry:6, manifestLoadingMaxRetry:2, levelLoadingMaxRetry:4, fragLoadingRetryDelay:800, manifestLoadingRetryDelay:800, timeout:25000});
    state.hls = hls;
    let nativeFallbackDone = false;
    hls.loadSource(url); hls.attachMedia(v);
    hls.on(Hls.Events.ERROR, (ev,data)=>{
      if(!data.fatal) return;
      const code = (data.response && data.response.code) || (data.networkDetails && data.networkDetails.status) || '';
      console.warn('HLS fatal', data.details, code, data);
      // One native fallback attempt for frag errors (TVs often handle proxied HLS natively)
      if(!nativeFallbackDone && /fragLoad|buffer/i.test(data.details||'')){
        nativeFallbackDone = true;
        try{ hls.destroy(); }catch{}
        state.hls = null;
        v.src = url;
        v.onerror = ()=>{ $('playerError').textContent='Native player also blocked (HTTP 401). Provider rejects video from this host — use http:// LAN (npx serve) or ask provider for an HTTPS host for direct playback.'; };
        v.play().then(()=>{ $('playerError').textContent=''; }).catch(()=>{ $('playerError').textContent='Retrying with native player… (frag failed'+(code?' HTTP '+code:'')+')'; });
        return;
      }
      $('playerError').textContent='Playback error: '+data.type+' — '+(data.details||'')+(code?' (HTTP '+code+')':'')+'. Checking reason…';
      // Fetch manifest once more to surface provider's real message (401 body)
      fetch(url).then(async (r)=>{
        const t = await r.text().catch(()=> '');
        let msg = t.slice(0, 220);
        try { const j = JSON.parse(t); if(j.body) msg = String(j.body).slice(0, 220); else if(j.error) msg = String(j.error).slice(0, 220); } catch {}
        // Hide password-like tokens from screen
        msg = msg.replace(/(password=|\/)[^\s&/]{8,}/gi, '$1***');
        $('playerError').textContent='Playback error: '+data.type+' — '+(data.details||'')+(code?' (HTTP '+code+')':'')+'. Upstream says: '+msg;
      }).catch(()=>{
        $('playerError').textContent='Playback error: '+data.type+' — '+(data.details||'')+(code?' (HTTP '+code+')':'')+'. Provider blocks this stream (401 = bad user/pass for streams, or IP-/UA-blocked video).';
      });
    });
    v.play().catch(()=>{});
  } else if(url.includes('.m3u8')){
    v.src = url; v.play().catch(e=>{ $('playerError').textContent='Cannot play: '+e.message; });
  } else {
    v.src = url; v.play().catch(e=>{ $('playerError').textContent='Cannot play: '+e.message; });
  }
}
async function openPlayer(s){
  state.current = s;
  $('playerOverlay').classList.add('open');
  $('playerOverlay').setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  $('nowTitle').textContent = s.name || '';
  $('seriesBox').innerHTML=''; $('epgBox').innerHTML='';
  updateFavBtn();
  if(state.type==='series'){ await loadSeries(s); }
  else { playUrl(streamUrl(s)); if(state.type==='live') loadEpg(s.stream_id); }
  $('backBtn').focus();
}
function updateFavBtn(){ $('favToggle').textContent = isFav(state.current.stream_id) ? '★ Favorited' : '☆ Fav'; }
async function loadSeries(s){
  $('seriesBox').innerHTML='Loading episodes...';
  try{
    const info = await api('action=get_series_info&series_id='+s.series_id);
    const eps = info.episodes || {};
    $('seriesBox').innerHTML='';
    Object.keys(eps).sort().forEach(season=>{
      const d = document.createElement('div');
      const h=document.createElement('div'); h.className='season'; h.textContent='Season '+season; d.appendChild(h);
      const wrap = document.createElement('div'); wrap.className='ep-list';
      eps[season].forEach(ep=>{
        const b=document.createElement('button'); b.type='button';
        b.textContent='E'+ep.episode_num; b.title=ep.title||'';
        b.onclick=()=>{
          const ext = ep.container_extension||'mp4';
          playUrl(state.server + '/series/' + encodeURIComponent(state.user) + '/' + encodeURIComponent(state.pass) + '/' + ep.id + '.' + ext);
          $('nowTitle').textContent = (s.name||'') + ' S'+season+' E'+ep.episode_num;
        };
        wrap.appendChild(b);
      });
      d.appendChild(wrap); $('seriesBox').appendChild(d);
    });
    const firstBtn = $('seriesBox').querySelector('button');
    if(firstBtn) firstBtn.click();
  }catch(e){ $('seriesBox').textContent='Failed to load episodes: '+e.message; }
}
async function loadEpg(streamId){
  const box = $('epgBox');
  box.style.display = 'none';
  box.innerHTML = '';
  try{
    const data = await api('action=get_short_epg&stream_id='+streamId);
    const list = (data && data.epg_listings) || [];
    if(!list.length) return;
    box.innerHTML = list.slice(0,4).map(e=>'<div><b>'+escapeHtml(e.title||'')+'</b> — '+escapeHtml(e.start||'')+' → '+escapeHtml(e.stop||'')+'<br>'+escapeHtml((e.description||'').slice(0,200))+'</div>').join('');
    if(box.innerHTML) box.style.display = '';
  }catch{ box.style.display = 'none'; box.innerHTML=''; }
}
function closePlayer(){
  stopStream();
  $('playerOverlay').classList.remove('open');
  $('playerOverlay').setAttribute('aria-hidden','true');
  document.body.style.overflow='';
}
// Sidebar: drawer on mobile, collapsible on desktop
function toggleSidebar(){
  const sb=$('sidebar'), bd=$('backdrop');
  if(isMobile()){ const open=sb.classList.toggle('open'); bd.classList.toggle('open',open); if(open){ const f=sb.querySelector('#catList button'); if(f) setTimeout(()=>f.focus(),50); } }
  else { sb.classList.toggle('hidden'); if(!sb.classList.contains('hidden')){ const f=sb.querySelector('#catList button'); if(f) setTimeout(()=>f.focus(),50); } }
}
function closeSidebar(){ $('sidebar').classList.remove('open'); $('backdrop').classList.remove('open'); }
function openSidebarDesktop(){ $('sidebar').classList.remove('hidden','open'); $('backdrop').classList.remove('open'); }
// TV D-pad navigation: arrows move focus, lists auto-scroll
function handleTvArrows(e){
  const active = document.activeElement;
  const inCats = active && active.matches && active.matches('#catList button');
  const inGrid = active && active.matches && active.matches('#grid .card');
  const catBtns = Array.from(document.querySelectorAll('#catList button'));
  const cards = Array.from(document.querySelectorAll('#grid .card'));
  if(inCats){
    const i = catBtns.indexOf(active);
    if(e.key==='ArrowDown' && catBtns[i+1]){ e.preventDefault(); catBtns[i+1].focus(); }
    else if(e.key==='ArrowUp' && catBtns[i-1]){ e.preventDefault(); catBtns[i-1].focus(); }
    else if(e.key==='ArrowRight' && cards[0]){ e.preventDefault(); cards[0].focus(); }
    else if(e.key==='ArrowLeft' && isMobile()){ e.preventDefault(); closeSidebar(); $('menuBtn').focus(); }
    return;
  }
  if(inGrid){
    const i = cards.indexOf(active);
    const cols = Math.max(1, Math.floor($('grid').offsetWidth / (active.offsetWidth + 12)) || 1);
    if(e.key==='ArrowRight' && cards[i+1]){ e.preventDefault(); cards[i+1].focus(); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); if(i % cols === 0){ const sb=$('sidebar'); if(sb.classList.contains('hidden')) sb.classList.remove('hidden'); const cur=catBtns.find(b=>b.classList.contains('active'))||catBtns[0]; if(cur) cur.focus(); } else if(cards[i-1]) cards[i-1].focus(); }
    else if(e.key==='ArrowDown' && cards[i+cols]){ e.preventDefault(); cards[i+cols].focus(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); if(cards[i-cols]) cards[i-cols].focus(); else document.querySelector('.tab.active').focus(); }
    return;
  }
  // Not in a list: Down from tabs/search goes to grid, Left/Right between tabs
  if(e.key==='ArrowDown' && (active.matches('.tab') || active.id==='search' || active.id==='menuBtn')){
    e.preventDefault();
    if(catBtns[0] && document.activeElement.id==='menuBtn'){ catBtns[0].focus(); }
    else if(cards[0]) cards[0].focus();
  }
}
window.addEventListener('DOMContentLoaded', ()=>{
  const saved = localStorage.getItem('iptv_login');
  if(saved){ try{ const o=JSON.parse(saved); $('serverUrl').value=o.s||''; $('username').value=o.u||''; $('password').value=o.p||''; }catch{} }
  $('loginBtn').onclick = login;
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>loadSection(b.dataset.type));
  $('search').oninput = (e)=>{ state.query=e.target.value.trim(); renderGrid(); };
  const cs=$('catSearch'); if(cs) cs.oninput=(e)=>{ state.catQuery=e.target.value.trim(); renderCats(); };
  $('favBtn').onclick = ()=>{ state.favOnly=!state.favOnly; $('favBtn').textContent=state.favOnly?'★':'☆'; renderGrid(); };
  $('logoutBtn').onclick = ()=>{ localStorage.removeItem('iptv_login'); location.reload(); };
  $('menuBtn').onclick = (e)=>{ e.stopPropagation(); toggleSidebar(); };
  $('closeSide').onclick = closeSidebar; $('backdrop').onclick = closeSidebar;
  $('backBtn').onclick = closePlayer;
  $('favToggle').onclick = ()=>{ if(state.current){ toggleFav(state.current.stream_id); updateFavBtn(); } };
  // Auto-scroll focused item into view (TV / keyboard)
  document.addEventListener('focusin', (e)=>{
    if(e.target.matches('#catList button, #grid .card, .tab')){
      try{ e.target.scrollIntoView({block:'nearest', behavior:'smooth'}); }catch{}
    }
  });
  document.addEventListener('keydown', (e)=>{
    if($('playerOverlay').classList.contains('open') && (e.key==='Escape'||e.key==='Backspace'||e.key==='XF86Back')){ e.preventDefault(); closePlayer(); return; }
    if($('playerOverlay').classList.contains('open')) return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) handleTvArrows(e);
  });
  [$('serverUrl'),$('username'),$('password')].forEach(i=>i.addEventListener('keydown',e=>{ if(e.key==='Enter') login(); }));
});
