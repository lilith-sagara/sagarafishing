const http = require('http');
const path = require('path');
const fs = require('fs');
const DB = require('./database.js');
const aiChat = require('./ai_chat.js');

const PORT = parseInt(process.env.MONITOR_PORT || '3001', 10);
const MAX_EVENTS = 200;
const AUTORELOAD_MS = 4000;
const AI_HITS = new Map();
const AI_COOLDOWN_MS = 10000;

const events = [];
const clients = new Set();
let seq = 0;

function push(action, username, detail, extra = {}) {
    const ev = { id: ++seq, ts: Date.now(), action, username: username || 'anonim', detail, ...extra };
    events.push(ev);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    clients.forEach(res => {
        try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch (e) { clients.delete(res); }
    });
    return ev;
}

function evCounts() {
    const counts = { mancing: 0, jual: 0, trading: 0, daftar: 0, claim: 0, pindahpulau: 0, gacha: 0, museum: 0 };
    const now = Date.now();
    events.forEach(e => {
        if (now - e.ts < 86400000 && counts[e.action] !== undefined) counts[e.action]++;
    });
    return counts;
}

function getStats() {
    let users = 0, catches = 0;
    try {
        users = DB.getUserCount ? DB.getUserCount() : 0;
        catches = DB.getTotalCatches ? DB.getTotalCatches() : 0;
    } catch (e) { /* db belum siap */ }
    const fishingNow = events.some(e => e.action === 'mancing' && Date.now() - e.ts < 5 * 60000);
    return {
        users,
        catches,
        fishingNow,
        counts: evCounts(),
        lastEvent: events.length ? events[events.length - 1] : null,
        uptime: process.uptime()
    };
}

function sendRes(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(body);
}

function handleApi(url, res) {
    if (url === '/api/recent') return sendRes(res, 200, { ok: true, events: events.slice(-100) });
    if (url === '/api/stats') return sendRes(res, 200, { ok: true, ...getStats() });
    if (url === '/api/prices') {
        try {
            const prices = DB.getAssetPrices ? DB.getAssetPrices() : [];
            sendRes(res, 200, { ok: true, prices });
        } catch (e) {
            console.error('[monitor] /api/prices error:', e.message, e.stack ? e.stack.split('\n')[1] : '');
            sendRes(res, 200, { ok: true, prices: [] });
        }
        return;
    }
    sendRes(res, 404, { ok: false, msg: 'not found' });
}

function sendPreamble(ev) {
    return `data: ${JSON.stringify(ev)}\n\n`;
}

function handleAiEndpoint(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        return res.end();
    }
    const ip = (req.socket && req.socket.remoteAddress) || 'x';
    const now = Date.now();
    if (now - (AI_HITS.get(ip) || 0) < AI_COOLDOWN_MS) {
        return sendRes(res, 429, { ok: false, msg: 'Sabar ya, tunggu ~10 detik antara pertanyaan 😌' });
    }
    const answer = (q) => {
        if (!q || !q.trim()) return sendRes(res, 400, { ok: false, msg: 'Pertanyaan kosong nggih.' });
        console.log('🤖 [NG-AI-WEB] q=' + String(q).trim().slice(0, 100));
        aiChat.NgawiAI(String(q).trim().slice(0, 2000)).then(r => {
            const text = r && r.status ? (r.answer || '').replace(/\*\*(.+?)\*\*/g, '*$1*').trim() : '';
            const reply = text ? text.slice(0, 4000) : ('⚠️ Ngawi AI lagi sibuk (err ' + (r && r.code) + '), coba lagi sebentar ya.');
            sendRes(res, 200, { ok: !!text, answer: reply });
        }).catch(e => sendRes(res, 200, { ok: false, answer: '⛔ Ngawi AI error: ' + String(e.message).slice(0, 200) }));
    };
    if (req.method === 'GET') {
        let q = null;
        try { q = new URL(req.url, 'http://ngawi.local').searchParams.get('q'); } catch (e) {}
        return answer(q);
    }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 8192) req.destroy(); });
    req.on('end', () => {
        try { const j = JSON.parse(body); answer(j && j.question); }
        catch (e) { answer(null); }
    });
}

const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url === '/api/ai') return handleAiEndpoint(req, res);
    if (url.startsWith('/api/')) return handleApi(url, res);
    if (url === '/events' || url === '/stream') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no'
        });
        res.write('retry: 3000\n\n');
        events.slice(-50).forEach(ev => res.write(sendPreamble(ev)));
        clients.add(res);
        req.on('close', () => clients.delete(res));
        const hb = setInterval(() => {
            try { res.write(': ping\n\n'); } catch (e) { clearInterval(hb); clients.delete(res); }
        }, 15000);
        return;
    }
    if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML);
        return;
    }
    if (url === '/ngawi' || url === '/ngawiaI') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(NGAWI_HTML);
        return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
});

function start() {
    if (process.env.MONITOR_DISABLED) return;
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`📡 Monitor dashboard: http://localhost:${PORT} (LAN: http://<ip-rumah>:${PORT})`);
    });
}

const HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sagara Monitor</title>
<style>
:root{
  --bg:#0a0f1c; --panel:#111a2c; --panel2:#0d1524; --line:#1d2a44;
  --txt:#dbe7f5; --dim:#6d7f9e; --faint:#46577a;
  --teal:#2dd4bf; --amber:#f5b942; --red:#f87171; --blue:#60a5fa; --green:#4ade80; --violet:#a78bfa;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  background:
    radial-gradient(1200px 600px at 80% -10%, rgba(45,212,191,0.07), transparent 60%),
    var(--bg);
  color:var(--txt);
  font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  display:flex; flex-direction:column;
}
header{
  display:flex; align-items:center; gap:14px;
  padding:14px 22px; border-bottom:1px solid var(--line);
  background:rgba(10,15,28,0.85); backdrop-filter:blur(6px);
}
.brand{font-weight:700; letter-spacing:.04em; font-size:15px}
.brand span{color:var(--teal)}
.status{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dim);margin-left:auto}
.dot{width:8px;height:8px;border-radius:50%;background:var(--faint)}
.dot.on{background:var(--green);box-shadow:0 0 8px rgba(74,222,128,.6)}
.clock{font-family:var(--mono);color:var(--dim);font-size:12px}
.ticker{margin-left:auto;font-size:11px;font-family:var(--mono);color:var(--dim);max-width:45%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
body{display:flex;flex-direction:column}
main{flex:1;display:grid;grid-template-columns:1fr 380px;gap:16px;padding:16px 22px;min-height:0}
@media(max-width:900px){main{grid-template-columns:1fr}.ticker{display:none}}
.col{display:flex;flex-direction:column;gap:14px;min-height:0}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.panel h2{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);padding:12px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.kpi .l{font-size:11px;color:var(--dim);letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px}
.kpi .v{font-size:26px;font-weight:700;font-family:var(--mono);color:var(--txt)}
.kpi .v small{font-size:12px;color:var(--dim);font-family:var(--mono)}
.kpi.pulse .v{color:var(--teal)}
#feed{flex:1;overflow-y:auto;min-height:0}
#feed::-webkit-scrollbar{width:8px}
#feed::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
.f-item{display:flex;gap:10px;padding:9px 16px;border-bottom:1px solid rgba(29,42,68,.55);align-items:baseline;animation:in .25s ease}
@keyframes in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.f-idx{font-family:var(--mono);font-size:11px;color:var(--faint);min-width:34px}
.f-ts{font-family:var(--mono);font-size:11px;color:var(--faint);min-width:64px}
.f-usr{font-weight:600;margin-right:4px}
.f-act{font-family:var(--mono);font-size:10.5px;letter-spacing:.05em;padding:1px 6px;border-radius:5px;margin-right:4px;flex-shrink:0}
.f-det{color:var(--txt)}
svg.spark{shape-rendering:crispEdges}
.actions{display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px}
.actions .chip{font-size:11px;font-family:var(--mono);color:var(--dim);border:1px solid var(--line);border-radius:6px;padding:2px 8px}
.actions .chip b{color:var(--txt)}
.tbl{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:12px}
.tbl th{color:var(--dim);font-weight:600;text-align:left;padding:7px 12px;border-bottom:1px solid var(--line);font-size:10px;letter-spacing:.08em;text-transform:uppercase}
.tbl td{padding:7px 12px;border-bottom:1px solid rgba(29,42,68,.45)}
.up{color:var(--green)}.dn{color:var(--red)}.st{color:var(--dim)}
.empty{padding:28px;text-align:center;color:var(--faint);font-size:13px}
</style>
</head>
<body>
<header>
  <div class="brand">SAGARA <span>MONITOR</span></div>
  <div class="ticker" id="ticker"></div>
  <div class="status"><span class="dot" id="sdot"></span><span id="stxt">menghubungkan…</span></div>
  <div class="clock" id="clock"></div>
</header>
<main>
  <div class="col">
    <div class="kpis">
      <div class="kpi"><div class="l">Pemancing</div><div class="v" id="k-users">–</div></div>
      <div class="kpi pulse"><div class="l">Sedang Mancing</div><div class="v" id="k-fishing">Tidak</div></div>
      <div class="kpi"><div class="l">Tangkapan</div><div class="v" id="k-catch">–</div></div>
      <div class="kpi"><div class="l">Uptime</div><div class="v" id="k-up">–</div></div>
    </div>
    <div class="panel" style="flex:1;display:flex;flex-direction:column;min-height:200px">
      <h2>● Aktivitas Langsung</h2>
      <div id="feed"><div class="empty">Menunggu aktivitas…</div></div>
    </div>
  </div>
  <div class="col">
    <div class="panel">
      <h2>Statistik Hari Ini</h2>
      <div class="actions" id="acts"></div>
    </div>
    <div class="panel">
      <h2>Pasar Trading</h2>
      <div id="wrap-price"></div>
    </div>
  </div>
</main>
<script>
const COLORS={maning:"var(--teal)",mancing:"var(--teal)",jual:"var(--amber)",trading:"var(--blue)",daftar:"var(--green)",claim:"var(--violet)",pindahpulau:"var(--teal)",gacha:"var(--violet)",museum:"var(--amber)"};
const ACTS={maning:"MANCING",mancing:"MANCING",jual:"JUAL",trading:"TRADING",daftar:"DAFTAR",claim:"CLAIM",pindahpulau:"PINDAH",gacha:"GACHA",museum:"MUSEUM"};
const fmtT=(ts)=>{const d=new Date(ts);const p=n=>String(n).padStart(2,'0');return p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds());};
const feedEl=document.getElementById('feed');
function addItem(ev,prepend=false){
  if(!ev||!ev.ts)return;
  const idx=document.querySelectorAll('.f-item').length;
  const row=document.createElement('div');row.className='f-item';
  const act=(ev.action||'?').toLowerCase();
  row.innerHTML='<span class="f-idx">#'+ev.id+'</span><span class="f-ts">'+fmtT(ev.ts)+'</span><span class="f-act" style="color:'+(COLORS[act]||'var(--dim)')+';border:1px solid currentColor">'+(ACTS[act]||act.toUpperCase())+'</span><span class="f-usr">'+esc(ev.username)+'</span><span class="f-det">'+esc(ev.detail||'')+'</span>';
  if(prepend){feedEl.prepend(row);}
  else{feedEl.appendChild(row);}
  while(feedEl.children.length>120)feedEl.removeChild(feedEl.lastChild);
}
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function updStats(s){
  if(!s)return;
  setText('k-users',(s.users||'–').toLocaleString());
  setText('k-fishing',s.fishingNow?'Ya':'Tidak');
  setText('k-catch',(s.catches||'–').toLocaleString());
  setText('k-up',fmtDur(s.uptime||0));
  const el=document.getElementById('acts');el.innerHTML='';
  const map={maning:'Mancing',mancing:'Mancing',jual:'Jual Ikan',trading:'Trading',daftar:'Daftar',claim:'Klaim Misi',pindahpulau:'Pindah Pulau',gacha:'Gacha'};
  Object.entries(s.counts||{}).forEach(([k,v])=>{if(v===undefined)return;const c=document.createElement('span');c.className='chip';c.innerHTML=esc(map[k]||k)+' <b>'+v+'</b>';el.appendChild(c);});
}
function setText(id,t){const e=document.getElementById(id);if(e)e.textContent=t;}
function fmtDur(sec){
  const d=Math.floor(sec/86400),h=Math.floor(sec/3600)%24,m=Math.floor(sec/60)%60,s=Math.floor(sec%60);
  return d>0?d+'d '+h+'j':(h>0?h+'j '+m+'m':m+'m '+s+'s');
}
function updPrices(list){
  if(!list||!list.length){document.getElementById('wrap-price').innerHTML='<div class="empty">–</div>';return;}
  const top=list.slice(0,10);
  const h='<table class="tbl"><thead><tr><th>Simbol</th><th>Harga</th><th>24j</th></tr></thead><tbody>'
  +top.map(p=>{
    const cls=p.changePct>0?'up':p.changePct<0?'dn':'st';
    const sign=(p.changePct>=0?'+':'');
    return '<tr><td>'+esc(p.symbol)+'</td><td>'+fmtPn(p.price)+'</td><td class="'+cls+'">'+sign+p.changePct+'%</td></tr>';
  }).join('')+'</tbody></table>';
  document.getElementById('wrap-price').innerHTML=h;
}
function fmtPn(n){
  if(n>=1e12)return (n/1e12).toFixed(2).replace(/\.?0+$/,'')+'T';
  if(n>=1e9)return (n/1e9).toFixed(2).replace(/\.?0+$/,'')+'M';
  if(n>=1e6)return (n/1e6).toFixed(2).replace(/\.?0+$/,'')+'Jt';
  if(n>=1e3)return (n/1e3).toFixed(2).replace(/\.?0+$/,'')+'rb';
  return Math.round(n);
}
// SSE
function connect(){
  const es=new EventSource('/events');
  es.onmessage=e=>{try{const ev=JSON.parse(e.data);addItem(ev,true);}catch(x){}};
  es.onopen=()=>{document.getElementById('sdot').classList.add('on');document.getElementById('stxt').textContent='terhubung';};
  es.onerror=()=>{document.getElementById('sdot').classList.remove('on');document.getElementById('stxt').textContent='putus — mencoba lagi';es.close();setTimeout(connect,3000);};
  return es;
}
connect();
// polling
function pollStats(){fetch('/api/stats').then(r=>r.json()).then(s=>updStats(s)).catch(()=>{});}
function pollPrices(){fetch('/api/prices').then(r=>r.json()).then(j=>updPrices(j&&j.prices)).catch(()=>{});}
setInterval(pollStats,5000);setInterval(pollPrices,15000);pollStats();pollPrices();
setInterval(()=>{const d=new Date();const p=n=>String(n).padStart(2,'0');document.getElementById('clock').textContent=p(d.getHours())+" : "+p(d.getMinutes())+" : "+p(d.getSeconds());},1000);
(()=>{let t=[];setInterval(()=>{fetch('/api/prices').then(r=>r.json()).then(j=>{if(j&&j.prices){t=j.prices;const c=t.map(p=>p.symbol+' '+fmtPn(p.price)+(p.changePct>=0?' ▲':' ▼')).join('   •   ');document.getElementById('ticker').textContent=c;}}).catch(()=>{});},20000);})();
</script>
</body>
</html>`;

const NGAWI_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ngawiAI — Asisten Cerdas dari Bumi Ngawi</title>
<style>
:root{
  --bg:#f6f9f8; --card:#ffffff; --line:#e3ece9; --ink:#0b0b0b;
  --teal:#12b392; --teal-d:#0e8c72; --teal-light:#e5f5f1;
  --dim:#5c6b66; --faint:#94a39e;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  background:radial-gradient(900px 500px at 85% -10%, rgba(18,179,146,.14), transparent 60%),
             radial-gradient(700px 400px at -10% 110%, rgba(18,179,146,.10), transparent 55%),
             var(--bg);
  color:var(--ink);
  font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  display:flex; flex-direction:column;
}
.wrap{max-width:1040px;margin:0 auto;padding:26px 22px 40px;width:100%}
header{display:flex;align-items:center;gap:12px;padding:6px 0 4px}
.logo{font-size:34px;font-weight:900;letter-spacing:-.03em}
.logo .b{color:#000}
.logo .t{color:var(--teal-d)}
.tag{font-size:13px;color:var(--dim);margin-top:6px}
.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:34px;align-items:start;margin-top:34px}
@media(max-width:820px){.hero{grid-template-columns:1fr}}
.left h1{font-size:38px;line-height:1.25;font-weight:800;letter-spacing:-.02em;margin-bottom:14px}
.left h1 .t{color:var(--teal-d)}
.left p{color:var(--dim);font-size:16px;max-width:52ch;margin-bottom:18px}
.blurb{display:flex;flex-direction:column;gap:10px;margin-top:6px}
.blurb div{display:flex;gap:10px;align-items:flex-start;color:var(--ink);font-size:14.5px}
.blurb .ic{color:var(--teal-d);font-weight:800;flex-shrink:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:0 10px 30px rgba(11,11,11,.06);overflow:hidden}
.chat-head{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--line);background:var(--teal-light)}
.chat-head .av{width:34px;height:34px;border-radius:50%;background:var(--teal-d);color:#fff;display:grid;place-items:center;font-weight:800;font-size:15px}
.chat-head b{font-size:14.5px}
.chat-head small{display:block;color:var(--dim);font-size:11.5px;font-weight:400}
#chat{height:380px;overflow-y:auto;padding:16px 16px 8px;display:flex;flex-direction:column;gap:12px}
#chat::-webkit-scrollbar{width:7px}
#chat::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
.bub{max-width:82%;padding:9px 13px;border-radius:14px;font-size:14px;white-space:pre-wrap;word-break:break-word;animation:pop .18s ease}
@keyframes pop{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.u{align-self:flex-end;background:var(--ink);color:#fff;border-bottom-right-radius:4px}
.a{align-self:flex-start;background:#f0f5f3;color:var(--ink);border-bottom-left-radius:4px}
.a.typing{color:var(--dim);font-style:italic}
.inp{display:flex;gap:8px;padding:12px 14px;border-top:1px solid var(--line)}
.inp input{flex:1;border:1px solid var(--line);border-radius:12px;padding:11px 14px;font-size:14px;font-family:inherit;outline:none;background:#fbfdfc}
.inp input:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(18,179,146,.12)}
.inp button{border:none;border-radius:12px;background:var(--teal-d);color:#fff;font-size:14px;font-weight:700;padding:0 18px;cursor:pointer;font-family:inherit}
.inp button:hover{background:#0b7a63}
.inp button:disabled{opacity:.55;cursor:default}
.sugg{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}
.sugg span{font-size:12.5px;border:1px solid var(--line);border-radius:99px;padding:5px 12px;color:var(--dim);cursor:pointer;background:var(--card)}
.sugg span:hover{border-color:var(--teal);color:var(--teal-d)}
footer{margin-top:38px;text-align:center;color:var(--faint);font-size:12.5px}
footer b{color:var(--teal-d)}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo"><span class="b">ngawi</span><span class="t">AI</span></div>
    <div class="tag">Asisten cerdas dari Bumi Ngawi</div>
  </header>

  <div class="hero">
    <div class="left">
      <h1>Sugeng rawuh! Aku <span class="t">ngawiAI</span>, <br>siap mbantu apa wae.</h1>
      <p>Monggo, tanya apa saja — dari urusan teknologi, belajar, tugas sekolah, sampai ngobrol santai. Karone santai, jawaban tetep jelas lan bener.</p>
      <div class="blurb">
        <div><span class="ic">✓</span><span><b>Cepat &amp; ringkas</b> — jawaban padat, ga bertele-tele.</span></div>
        <div><span class="ic">✓</span><span><b>Bahasa Indonesia</b> dengan sentuhan logat Ngawi yang hangat.</span></div>
        <div><span class="ic">✓</span><span><b>Gratis</b> — nggak butuh API key, nggak bayar.</span></div>
      </div>
      <div class="sugg">
        <span>Apa itu Ngawi?</span>
        <span>Jelasin cara kerja AI</span>
        <span>Bikin puisi tentang sawah</span>
        <span>Tips hemat di kampung</span>
      </div>
    </div>

    <div class="card">
      <div class="chat-head">
        <div class="av">Ng</div>
        <div><b>ngawiAI</b><small>online • balas cepat</small></div>
      </div>
      <div id="chat"></div>
      <form class="inp" id="form">
        <input id="q" placeholder="Tulis pertanyaan… (enter untuk kirim)" autocomplete="off">
        <button id="send" type="submit">Kirim</button>
      </form>
    </div>
  </div>

  <footer>dibuat dengan <b>ngawiAI</b> — Sagara Fishing · ngawi · Jawa Timur</footer>
</div>
<script>
const chat=document.getElementById('chat'),q=document.getElementById('q'),btn=document.getElementById('send');
function add(msg,who){
  const d=document.createElement('div');d.className='bub '+(who==='u'?'u':'a');d.textContent=msg;chat.appendChild(d);
  chat.scrollTop=chat.scrollHeight;
}
add('Nderek langkung, aku ngawiAI. Monggo takon apa wae, nggih!','a');
const SUGS=['Apa itu Ngawi?','Jelasin cara kerja AI','Bikin puisi tentang sawah','Tips hemat di kampung'];
document.querySelectorAll('.sugg span').forEach(s=>s.addEventListener('click',()=>{q.value=s.textContent;ask();}));
async function ask(){
  const text=q.value.trim();if(!text)return;
  q.value='';btn.disabled=true;
  add(text,'u');
  const typing=document.createElement('div');typing.className='bub a typing';typing.textContent='lagi mikir…';chat.appendChild(typing);chat.scrollTop=chat.scrollHeight;
  try{
    const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:text})});
    const j=await r.json();
    typing.remove();
    const msg=(j&&j.ok)?j.answer:(j&&j.msg||'⚠️ error, coba lagi ya.');
    add(msg,'a');
  }catch(e){typing.remove();add('⚠️ jaringan error: '+e.message,'a');}
  btn.disabled=false;chat.focus&&q.focus();
}
document.getElementById('form').addEventListener('submit',e=>{e.preventDefault();ask();});
</script>
</body>
</html>`;

start();

module.exports = { push, events, getStats };