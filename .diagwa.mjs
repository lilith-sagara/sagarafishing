const { makeWASocket, useMultiFileAuthState, fetchLatestWaWebVersion, makeCacheableSignalKeyStore, DisconnectReason } = await import('ourin-baileys');
const pino = await import('pino');
const logger = pino.default({ level: 'debug', transport: { target: 'pino/file', options: { destination: '/tmp/opencode/wa2.log' } } });
const { state, saveCreds } = await useMultiFileAuthState('/home/lilith/sagarafishing/session_wa');
let version = null;
try { version = (await fetchLatestWaWebVersion()).version; } catch (e) { console.log('fetchLatest err:', e.message); }
console.log('VERSION:', JSON.stringify(version));
const sock = makeWASocket({ version, logger, printQRInTerminal: false, auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) }, browser: ["Ubuntu", "Chrome", "20.0.04"] });
sock.ev.on('creds.update', saveCreds);
let qrShown = 0;
sock.ev.on('connection.update', (u) => {
  if (u.qr && qrShown++ < 3) console.log('QR:' + u.qr + '\n');
  if (u.connection === 'open') console.log('>>> CONNECTION OPEN <<<');
  if (u.lastDisconnect) {
    const e = u.lastDisconnect.error;
    const reason = e?.status ? DisconnectReason[e.status] : e?.message;
    console.log('DISCONNECT:', e?.message, '| status:', e?.status, '| reason:', reason);
  }
  if (u.connection === 'close') console.log('>>> CONNECTION CLOSE <<<');
});
process.on('SIGTERM', () => process.exit(0));
