const http = require('http');
const path = require('path');
const fs = require('fs');
const DB = require('./database.js');

const PORT = parseInt(process.env.MONITOR_PORT || '3001', 10);
const MAX_EVENTS = 200;
const AUTORELOAD_MS = 4000;

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

const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
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

start();

module.exports = { push, events, getStats };