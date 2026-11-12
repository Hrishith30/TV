/* Simple IPTV Player - Xtream Codes API (vanilla JS) */
const $ = (id) => document.getElementById(id);
const state = {
  server: '', user: '', pass: '', proxy: '',
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
function cleanProxy(u){
  u = (u||'').trim();
  if(!u) return '';
  if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/+$/,'');
}
// Same-origin /api/proxy only exists on Vercel / local_proxy_server.js; static hosts have none.
function sameOriginProxyPossible(){
  return location.protocol.startsWith('http') && !/\.github\.io$/i.test(location.hostname) && !/\.pages\.dev$/i.test(location.hostname);
}
function proxyTarget(target){ return (state.proxy || '') + '/api/proxy?target=' + encodeURIComponent(target); }
function httpsBase(url){ try{ const u = new URL(url); return u.protocol + '//' + u.host; }catch{ return null; } }
function proxyErrorText(body, status){
  let msg = String(body || '').slice(0, 160);
  try{ const j = JSON.parse(body); msg = String(j.body || j.error || msg).slice(0, 160); }catch{}
  return 'HTTP ' + status + (msg ? ' — ' + msg : '');
}
function mixedContentHint(){
  return 'This page is HTTPS but the stream is HTTP, so the browser blocks it. Put a Proxy URL on the login screen (an HTTPS address that runs /api/proxy, e.g. a Cloudflare Tunnel to local_proxy_server.js) or ask your provider for an HTTPS host.';
}
async function loadProxyConfig(){
  // Optional: proxy-config.json next to index.html sets a default Proxy URL for this deployment.
  try{
    const r = await fetch('proxy-config.json', { cache: 'no-store' });
    if(!r.ok) return '';
    const j = await r.json();
    return cleanProxy(j && j.proxy);
  }catch{ return ''; }
}
async function probeApiHttps(target){
  // HTTPS page + HTTP provider: try the panel's own HTTPS ports (no proxy needed if one answers).
  const tries = httpsCandidates(target).map((c)=>(async()=>{
    const ctl = new AbortController();
    const t = setTimeout(()=>ctl.abort(), 4000);
    try{
      const r = await fetch(c, { signal: ctl.signal });
      clearTimeout(t);
      if(!r.ok) return null;
      const base = httpsBase(c);
      if(!base) return null;
      return { base, json: await r.json() };
    }catch{ clearTimeout(t); return null; }
  })());
  const results = await Promise.all(tries);
  return results.find(Boolean) || null;
}
function apiUrl(params){
  return state.server + '/player_api.php?username=' + encodeURIComponent(state.user) + '&password=' + encodeURIComponent(state.pass) + '&' + params;
}
async function api(params){
  const target = apiUrl(params);
  const errs = [];
  // 1) Proxy: explicit Proxy URL first, then same-origin /api/proxy (Vercel, local_proxy_server.js)
  const bases = state.proxy ? [state.proxy] : [];
  if(sameOriginProxyPossible()) bases.push('');
  for(const base of bases){
    try{
      const r = await fetch((base || '') + '/api/proxy?target=' + encodeURIComponent(target));
      if(!r.ok) throw new Error(proxyErrorText(await r.text().catch(()=> ''), r.status));
      return await r.json();
    }catch(e){ errs.push((base || 'same-origin') + ' → ' + e.message); }
  }
  if(location.protocol === 'https:' && /^http:\/\//i.test(target)){
    // 2) Mixed content: try the provider's own HTTPS ports before giving up
    const hit = await probeApiHttps(target);
    if(hit){ state.server = hit.base; return hit.json; }
    errs.push('provider has no working HTTPS port');
  } else {
    // 3) Direct: works for file://, http:// LAN, and HTTPS providers that allow CORS
    try{
      const r = await fetch(target);
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    }catch(e){ errs.push('direct → ' + e.message); }
  }
  let hint;
  if(state.proxy) hint = 'Could not load the API through the proxy ' + state.proxy + ' (is it running and serving /api/proxy?).';
  else if(location.protocol === 'https:' && /^http:\/\//i.test(target)) hint = 'This page is HTTPS and the provider is HTTP, so the browser blocks it. Fill in the optional Proxy URL (an HTTPS address running /api/proxy) or use an HTTPS host from your provider.';
  else hint = 'Could not reach ' + state.server + ' — check the URL, the port, and that the panel is online.';
  throw new Error(hint + (errs.length ? ' [' + errs[errs.length-1] + ']' : ''));
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
  state.proxy = cleanProxy($('proxyUrl') ? $('proxyUrl').value : '');
  if(!state.server || !state.user || !state.pass){ err.textContent = 'Please fill server, username and password.'; return; }
  $('loginBtn').textContent = 'Connecting...'; $('loginBtn').disabled = true;
  try{
    const info = await api('action=get_account_info');
    if(!info || !info.user_info || info.user_info.auth == 0) throw new Error('Invalid username / password.');
    if(info.user_info.exp_date){
      const d = new Date(info.user_info.exp_date*1000);
      $('statusBar').textContent = 'Account: ' + info.user_info.username + ' | Expires: ' + d.toLocaleDateString();
    }
    if($('remember').checked) localStorage.setItem('iptv_login', JSON.stringify({s:state.server,u:state.user,p:state.pass,x:state.proxy}));
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
function httpsCandidates(httpUrl){
  // Same host/path over HTTPS ports providers commonly use (browser direct = home IP)
  try{
    const u = new URL(httpUrl);
    const path = u.pathname + u.search;
    const out = [];
    for(const p of [u.port, '443', '2083', '2096']){
      if(!p) continue;
      const c = 'https://' + u.hostname + ':' + p + path;
      if(!out.includes(c)) out.push(c);
    }
    return out;
  }catch{ return []; }
}
async function probeDirectHttps(httpUrl){
  // Browser-direct probe (home IP), all ports in parallel. HLS needs CORS anyway, so a readable playlist = playable.
  const tries = httpsCandidates(httpUrl).map((c)=>(async()=>{
    const ctl = new AbortController();
    const t = setTimeout(()=>ctl.abort(), 3500);
    try{
      const r = await fetch(c, { signal: ctl.signal });
      clearTimeout(t);
      if(!r.ok) return null;
      const txt = await r.text();
      return txt.includes('#EXTM3U') ? c : null;
    }catch{ clearTimeout(t); return null; }
  })());
  const results = await Promise.all(tries);
  return results.find(Boolean) || null;
}
function b64(s){
  // Xtream EPG fields arrive base64-encoded; leave plain text untouched
  s = String(s == null ? '' : s).trim();
  if(!s || s.length % 4 !== 0 || !/^[A-Za-z0-9+/=]+$/.test(s)) return s;
  try{
    const bin = atob(s);
    return new TextDecoder().decode(Uint8Array.from(bin, (c)=>c.charCodeAt(0)));
  }catch{ return s; }
}
function playMp4List(v, list, idx){
  if(idx >= list.length){
    $('playerError').textContent='All video routes failed. Check the Proxy URL (it must be an HTTPS address that runs /api/proxy), or ask your provider for an HTTPS host.';
    return;
  }
  v.onerror = ()=>playMp4List(v, list, idx+1);
  v.onloadeddata = ()=>{ $('playerError').textContent=''; };
  v.src = list[idx];
  v.play().catch(()=>{});
}
async function playUrl(origUrl){
  stopStream();
  $('playerError').textContent='';
  const v = $('video');
  v.poster = '';
  v.onerror = null; v.onloadeddata = null;
  // HTTPS page + HTTP stream = mixed content; try the provider's HTTPS ports, then the proxy
  if(!(location.protocol==='https:' && /^http:\/\//i.test(origUrl))){
    startPlayback(origUrl, v);
    return;
  }
  if(/\.m3u8(\?|$)/i.test(origUrl)){
    $('playerError').textContent='Finding direct HTTPS stream…';
    const direct = await probeDirectHttps(origUrl);
    $('playerError').textContent='';
    if(direct){ startPlayback(direct, v); return; }
    if(state.proxy){ startPlayback(proxyTarget(origUrl), v); return; }
    $('playerError').textContent = mixedContentHint();
    return;
  }
  // MP4 needs no CORS for <video>: try HTTPS ports directly, proxy last
  const list = httpsCandidates(origUrl);
  if(state.proxy) list.push(proxyTarget(origUrl));
  if(list.length){ playMp4List(v, list, 0); return; }
  $('playerError').textContent = mixedContentHint();
}
function startPlayback(url, v){
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
        v.onerror = ()=>{ $('playerError').textContent='Native player also blocked'+(code?' (HTTP '+code+')':'')+'. Set the Proxy URL or use your provider\'s HTTPS host.'; };
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
    playMp4List(v, [url], 0);
  } else {
    playMp4List(v, [url], 0);
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
    box.innerHTML = list.slice(0,4).map(e=>'<div><b>'+escapeHtml(b64(e.title))+'</b> — '+escapeHtml(b64(e.start))+' → '+escapeHtml(b64(e.stop))+'<br>'+escapeHtml(b64(e.description).slice(0,200))+'</div>').join('');
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
window.addEventListener('DOMContentLoaded', async ()=>{
  // Proxy precedence: ?proxy= in the URL > saved login > proxy-config.json next to index.html
  const saved = localStorage.getItem('iptv_login');
  if(saved){ try{ const o=JSON.parse(saved); $('serverUrl').value=o.s||''; $('username').value=o.u||''; $('password').value=o.p||''; state.proxy = cleanProxy(o.x); }catch{} }
  const fromUrl = new URLSearchParams(location.search).get('proxy');
  if(fromUrl) state.proxy = cleanProxy(fromUrl);
  if(!state.proxy) state.proxy = await loadProxyConfig();
  $('proxyUrl').value = state.proxy;
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
