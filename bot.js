const dotenv = require('dotenv');
dotenv.config();
const { Telegraf } = require('telegraf');
const pino = require('pino');
const db = require('./database.js');
const fs = require('fs');
const { RODS, getMainMenuKeyboard } = require('./keyboards.js');
const { startPhantomAnglers } = require('./phantom_anglers.js');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

function getMenuText(user) {
    const activeRod = RODS.find(r => r.tier === (user.rod_tier || 1));
    const invCount = db.getInventoryCount(user.user_id);
    const assetVal = db.getAssetValue(user.user_id);
    return `╭━─━─━─━─━─━─━─━─━─━─━─━─━╮
║       🌊 *S A G A R A* 🌊       ║
║   🐟 *F I S H I N G   B O T*   ║
║  Serunya nangkap ikan jutaan!  ║
╰━─━─━─━─━─━─━─━─━─━─━─━─━╯

╭╮ 🔍 INFO PEMANCING
││ 🧑 Nama      : *${user.username}*
││ 💰 Koin      : ${fmtKoin(user.coins)}
││ 💎 Aset      : ${fmtKoin(assetVal)}
││ 🆙 Level     : ${user.level}
││ 🎣 Pancingan : ${activeRod?.name || 'Rod Tier ' + (user.rod_tier || 1)}
││ 🎒 Ikan      : ${invCount} ekor
╰╯

╭╮ 🎣 FITUR UTAMA
││ ▸ .mancing          Langsung mancing!
││ ▸ .trading          Beli/jual saham & kripto
││ ▸ .setpancingan     Atur pancingan aktif
││ ▸ .inventory        Lihat simpanan ikan
││ ▸ .museum           Pamer & jual koleksi
││ ▸ .toko             Beli pancingan baru
││ ▸ .gacha / .gacha2  Gacha rod langka
╰╯

╭╮ 🧰 LAIN-LAIN
││ ▸ .beli   .belilevel   .belipulau
││ ▸ .pindahpulau   .activator   .cooldown
││ ▸ .profile   .rank   .setann   .daftar
╰╯

♪ Selamat mancing-mancing, Nak! 🐙`;
}

let activeSock = null;
let broadcasting = false;
const sleepMs = (ms) => new Promise(r => setTimeout(r, ms));

const fmtPrice = (n) => {
    if (n >= 1e12) return (n / 1e12).toFixed(2).replace(/\.?0+$/, '') + ' T';
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' M';
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + ' Jt';
    return Math.round(n).toLocaleString();
};

const fmtKoin = (n) => {
    if (n >= 0.999e12) return (n / 1e12).toFixed(2).replace(/\.?0+$/, '') + ' Triliun';
    if (n >= 0.999e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' Milyar';
    if (n >= 0.999e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + ' Juta';
    if (n >= 0.999e3) return (n / 1e3).toFixed(2).replace(/\.?0+$/, '') + ' Ribu';
    return Math.round(n).toLocaleString();
};

// Announcement otomatis setiap harga market di-roll (±1–100% tiap 15 mnt)
// Broadcast DM ke semua user yang pernah pakai command (jeda 2-3 detik anti-ban)
async function broadcastAnnouncement(text) {
    if (broadcasting) return { started: false, ok: 0, fail: 0 };
    broadcasting = true;
    const targets = db.getBroadcastUsers().map(u => u.jid);
    let ok = 0, fail = 0;
    try {
        for (const jid of targets) {
            if (!activeSock) break;
            try {
                await activeSock.sendMessage(jid, { text });
                ok++;
            } catch (e) {
                console.log('   → gagal kirim ke', jid, ':', e.message);
                fail++;
            }
            await sleepMs(2000 + Math.random() * 1000);
        }
    } catch (e) {
        console.warn('⚠️ Broadcast gagal:', e.message);
    } finally {
        broadcasting = false;
    }
    console.log(`📣 Broadcast selesai: ${ok} terkirim, ${fail} gagal`);
    return { started: true, ok, fail };
}

async function announcePriceUpdates() {
    try {
        const moves = db.rollPrices();
        if (!moves || moves.length === 0) return;
        const target = db.getAnnounceTarget();
        if (!target || !activeSock) return;
        const sorted = [...moves].sort((a, b) => b.pct - a.pct);
        const ups = sorted.filter(m => m.pct > 0);
        const downs = sorted.filter(m => m.pct < 0);
        let txt = `📈 *UPDATE PASAR SAGARA!*\nHarga aset naik/turun otomatis tiap 15 menit!\n\n`;
        if (ups.length > 0) {
            txt += `🟢 *Yang Naik:*\n`;
            ups.slice(0, 3).forEach(m => txt += `   ${m.symbol} ${m.name}  +${m.pct}% → ${fmtPrice(m.to)}\n`);
        }
        if (downs.length > 0) {
            txt += `\n🔴 *Yang Turun:*\n`;
            downs.slice(0, 3).forEach(m => txt += `   ${m.symbol} ${m.name}  ${m.pct}% → ${fmtPrice(m.to)}\n`);
        }
        txt += `\n📊 Ayo cek semua harga & jual-beli: *.trading*`;
        await activeSock.sendMessage(target, { text: txt });
        console.log(`📢 Announcement pasar dikirim ke ${target}`);
    } catch (e) {
        console.warn('⚠️ Gagal kirim announcement pasar:', e.message);
    }
}

async function startWhatsApp() {
    const { makeWASocket, useMultiFileAuthState, fetchLatestWaWebVersion, makeCacheableSignalKeyStore, DisconnectReason } = await import('ourin-baileys');
    const { state, saveCreds } = await useMultiFileAuthState('./session_wa');
    const { version } = await fetchLatestWaWebVersion();

    async function connectToWhatsApp() {
        const sock = makeWASocket({ version, logger: pino({ level: 'silent' }), printQRInTerminal: true, auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) }, browser: ["Ubuntu", "Chrome", "20.0.04"] });
        activeSock = sock;
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('any', (pairs) => {
            if (!Array.isArray(pairs)) return;
            for (const [name, data] of pairs) {
                const s = JSON.stringify(data);
                if (s && s.includes('47730491674663')) console.log(`[EVENT-ANY-USER] ${name} ${s.slice(0, 300)}`);
                if (name === 'messages.upsert') console.log(`[EVENT-UPSERT] type=${data && data.type} n=${data && data.messages && data.messages.length}`);
            }
        });
        const rememberChatJids = (chats) => {
            for (const c of chats) {
                const jid = c.id;
                if (!/@(s\.whatsapp\.net|lid)$/.test(jid)) continue;
                const uid = jid.replace(/[^0-9]/g, '');
                if (uid) db.setLastSeenJid(uid, jid);
            }
        };
        sock.ev.on('chats.set', ({ chats }) => rememberChatJids(chats));
        sock.ev.on('chats.upsert', rememberChatJids);
        // QR event listener (fallback if QR not auto‑printed)
        sock.ev.on('qr', qr => {
            console.log('\n=== QR CODE (scan with WhatsApp) ===');
            console.log(qr);
            console.log('=== End QR ===\n');
        });
        // ourin-baileys mengirim QR via connection.update, bukan event 'qr'
        sock.ev.on('connection.update', async update => {
            if (update.qr) {
                console.log('\n=== QR CODE (scan with WhatsApp) ===');
                require('qrcode-terminal').generate(update.qr, { small: true });
                console.log('=== End QR ===\n');
            }
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log('✅ WhatsApp terhubung');
                return;
            }
            if (connection === 'close') {
                const status = lastDisconnect?.error?.status;
                if (status === DisconnectReason.loggedOut) {
                    console.log('❌ Sesi WhatsApp dicabut (logged out). Hapus folder session_wa lalu jalankan ulang untuk QR baru.');
                } else {
                    console.log(`🔁 Koneksi WhatsApp terputus (status: ${status ?? 'unknown'}), reconnect dalam 3 detik...`);
                    console.log('   [KONEKSI-DEBUG]', lastDisconnect?.error?.message, '| stack:', (lastDisconnect?.error?.stack || '').split('\n')[1]);
                    setTimeout(connectToWhatsApp, 3000);
                }
            }
        });
        sock.ev.on('messages.upsert', async ({ messages }) => {
            try {
            const m = messages[0];
            if (!m?.message || m.key.fromMe) return;
            const from = m.key.remoteJid;
            const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').toLowerCase().trim();
            console.log(`[MSG-IN] from=${from} type=${Object.keys(m.message)[0]} text=${JSON.stringify(text)} keyType=${m.key.type}`);
            const userId = (m.key.participant || from || '').replace(/[^0-9]/g, '');
            if (userId) db.setLastSeenJid(userId, (m.key.participant || from));
            if (!text.startsWith('.')) return;
            const args = text.slice(1).split(' ');
            const cmd = args[0];
            const param = args.slice(1).join(' ');
            if (cmd === 'setann') {
                const isOff = (args[1] || '').toLowerCase() === 'off';
                if (isOff) {
                    db.clearAnnounceTarget();
                    return sock.sendMessage(from, { text: `🔕 Announcement pasar dimatikan. Untuk menyalakan ulang, ketik *.setann* di grup tujuan.` }, { quoted: m });
                }
                if (!from.endsWith('@g.us')) return sock.sendMessage(from, { text: `📌 *Set Announcement Pasar*\n\nJalankan perintah *.setann* *di dalam grup* yang mau dijadikan tempat pengumuman naik/turun harga (update tiap 15 menit).\n\n• Nyalakan: ketik *.setann* di grup itu\n• Matikan: *.setann off*\n\n💡 Bot otomatis mendeteksi ID grup dari chat tempat kamu mengetik perintah ini.` }, { quoted: m });
                db.setAnnounceTarget(from);
                return sock.sendMessage(from, { text: `✅ *GC ini jadi tempat announcement pasar!*\n📈 Pergerakan harga (naik/turun) otomatis dikirim ke sini tiap 15 menit.\n🔕 Untuk matikan: *.setann off*` }, { quoted: m });
            }
            let user = db.getUser(userId);
            if (cmd === 'fetchdm') {
                const isOwnerFetch = ((user && user.username.toLowerCase() === 'lilith') || String(userId) === '6287840275933');
                if (!isOwnerFetch) return;
                try {
                    const f = await activeSock.fetchMessages({ jid: '47730491674663@lid', count: 5 });
                    console.log('[FETCH-DM]', JSON.stringify(f.map(x => ({ type: Object.keys(x.message || {})[0], text: (x.message?.conversation || x.message?.extendedTextMessage?.text || '').slice(0, 60) }))));
                    return sock.sendMessage(from, { text: '✅ fetched: ' + f.length + ' pesan — cek log [FETCH-DM]' }, { quoted: m });
                } catch (e) {
                    console.log('[FETCH-DM-ERR]', e.message);
                    return sock.sendMessage(from, { text: '❌ fetch gagal: ' + e.message }, { quoted: m });
                }
            }
            if (cmd === 'announce') {
                const rawId = String(userId);
                const isOwner = (rawId === '6287840275933') || (user && user.username.toLowerCase() === 'lilith');
                console.log(`[ANNOUNCE-DEBUG] from=${from} userId=${rawId} username=${user ? user.username : '(belum daftar)'} isOwner=${isOwner}`);
                if (!isOwner) return sock.sendMessage(from, { text: `⛔ Akses ditolak. Command *.announce* khusus admin.\n(id kamu: ${rawId})` }, { quoted: m });
                if (!user) {
                    db.getOrCreateUser(rawId, 'lilith');
                }
                const pesan = param.trim();
                if (!pesan) return sock.sendMessage(from, { text: `📢 *Broadcast Announcement*\n\nCara: *.announce <pesan>*\nContoh: *.announce Event Mancing Dimulai Hari Ini!*\n\nPesan dikirim ke semua user via DM, jeda 2-3 detik per pesan biar aman.` }, { quoted: m });
                if (broadcasting) return sock.sendMessage(from, { text: `⏳ Masih ada broadcast yang berjalan. Tunggu sampai selesai.` }, { quoted: m });
                const users = db.getBroadcastUsers();
                const header = '📢 *PENGUMUMAN SAGARA FISHING*\n━━━━━━━━━━━━━━━━━\n';
                const footer = '\n━━━━━━━━━━━━━━━━━\n~ Bot Sagara Fishing';
                broadcastAnnouncement(header + pesan + footer);
                return sock.sendMessage(from, { text: `📢 *Announcement dikirim!*\n\n🗒️ ${pesan}\n\n👥 Dikirim ke *${users.length} user* (jeda 2-3 detik).` }, { quoted: m });
            }
            if (cmd === 'daftar') {
                const name = (param || '').trim().slice(0, 15);
                if (!user) {
                    if (!name) return sock.sendMessage(from, { text: `📝 *Daftar dulu yuk!*\n\nCara: *.daftar <nama>*\nContoh: *.daftar SagaraKing*\n\nSetelah daftar, semua fitur siap dipakai:\n.menu .profile .mancing .gacha .toko .setpancingan dll.` }, { quoted: m });
                    db.getOrCreateUser(userId, name);
                    return sock.sendMessage(from, { text: `✅ *Berhasil daftar!*\nSelamat datang, *${name}* di Sagara Fishing! 🌊\nKetik *.menu* untuk lihat semua fitur.` }, { quoted: m });
                }
                if (!name) return sock.sendMessage(from, { text: `❌ Nama kosong. Pakai: *.daftar <nama>*` }, { quoted: m });
                db.updateUsername(userId, name);
                return sock.sendMessage(from, { text: `✅ Nama diganti jadi *${name}*!` }, { quoted: m });
            }
            if (!user) {
                if (text.trim().startsWith('.')) return sock.sendMessage(from, { text: `⚠️ Kamu belum terdaftar!\nDaftar dulu: *.daftar <nama>*\nContoh: *.daftar SagaraKing*` }, { quoted: m });
                return;
            }

            if (cmd === 'menu') {
                return sock.sendMessage(from, { text: getMenuText(user) }, { quoted: m });
            }
            if (cmd === 'profile') {
                const assetVal = db.getAssetValue(userId);
                const totalNet = user.coins + assetVal;
                const myAssets = db.getAssetValue ? db.getUserAssets(userId) : [];
                let txt = `┌───「 *PROFIL PEMANCING* 」───┐\n│ 👤 *Nama:* ${user.username}\n│ 💰 *Tunai:* ${fmtKoin(user.coins)} Koin\n│ 💎 *Aset:* ${fmtKoin(assetVal)} Koin\n│ 📊 *Total Harta:* ${fmtKoin(totalNet)} Koin\n│ 🆙 *Level:* ${user.level}\n│ 🎣 *Rod Tier:* ${user.rod_tier || 1}\n│ 📍 *Pulau:* ${db.getSessionIsland(db.getSessionIslandKey(userId)).name}\n└────────────────────────┘\n`;
                if (myAssets.length > 0) {
                    txt += `┌───「 💼 ASET KAMU 」───┐\n`;
                    myAssets.forEach(a => txt += `│ 🎯 *${a.name}*\n│    (${a.symbol}) ${a.amount} unit = ${fmtKoin(a.value)} Koin\n`);
                    txt += `└────────────────────┘\n`;
                }
                txt += `💡 Pelajari pasar: *.trading*`;
                return sock.sendMessage(from, { text: txt }, { quoted: m });
            }
            if (cmd === 'setpancingan') {
                const owned = db.getUserRods(userId);
                if (param) {
                    const tier = parseInt(param);
                    const target = owned.find(o => o.rod_tier === tier);
                    if (!target) return sock.sendMessage(from, { text: `❌ Kamu belum punya pancingan tier ${tier}.` }, { quoted: m });
                    const rod = RODS.find(r => r.tier === tier);
                    const name = target.rod_name || rod?.name || `Tier ${tier}`;
                    db.updateRodTier(userId, tier);
                    return sock.sendMessage(from, { text: `✅ Pancingan diaktifkan: *${name}*` }, { quoted: m });
                }
                let txt = `┌───「 🎣 PANCINGAN KAMU 」───┐\n`;
                if (owned.length === 0) txt += `│ (belum punya pancingan)\n`;
                else owned.forEach(o => {
                    const rod = RODS.find(r => r.tier === o.rod_tier);
                    const name = o.rod_name || rod?.name || `Rod Tier ${o.rod_tier}`;
                    txt += `│ ${o.rod_tier === user.rod_tier ? '✅' : '  '} *${name}* (Tier ${o.rod_tier})\n`;
                });
                txt += `└───────────────────────┘\n\n💡 *Pakai:* .setpancingan <tier>`;
                return sock.sendMessage(from, { text: txt }, { quoted: m });
            }
            if (cmd === 'toko') {
                const owned = db.getUserRods(userId);
                if (param) {
                    const tier = parseInt(param);
                    const rod = RODS.find(r => r.tier === tier);
                    if (!rod || !rod.price) return sock.sendMessage(from, { text: `❌ Pancingan tier ${tier} tidak bisa dibeli.` }, { quoted: m });
                    if (owned.some(o => o.rod_tier === tier)) return sock.sendMessage(from, { text: `❌ Kamu sudah punya *${rod.name}*.` }, { quoted: m });
                    if (user.coins < rod.price) return sock.sendMessage(from, { text: `❌ Kurang Koin! Butuh *${fmtKoin(rod.price)}*.` }, { quoted: m });
                    db.updateCoins(userId, -rod.price);
                    db.addRod(userId, tier, rod.name);
                    db.updateRodTier(userId, tier);
                    return sock.sendMessage(from, { text: `✅ Membeli *${rod.name}* seharga *${fmtKoin(rod.price)} Koin*!\n🎣 Otomatis dipasang.` }, { quoted: m });
                }
                const buyable = RODS.filter(r => r.price > 0);
                let txt = `┌───「 🏪 TOKO PANCINGAN 」───┐\n`;
                buyable.slice(0, 26).forEach(r => {
                    const ownedMark = owned.some(o => o.rod_tier === r.tier) ? ' ✅' : '';
                    txt += `│ ${r.tier}. ${r.name} — ${fmtKoin(r.price)}${ownedMark}\n`;
                });
                txt += `└──────────────────────────┘\n\n💡 *Beli:* .toko <tier>`;
                return sock.sendMessage(from, { text: txt }, { quoted: m });
            }
            if (cmd === 'belilevel') {
                const n = parseInt(param) || 1;
                const cost = n * (user.level + 1) * 500000;
                if (user.coins < cost) return sock.sendMessage(from, { text: `❌ Kurang Koin! Butuh *${fmtKoin(cost)}* untuk ${n} level.` }, { quoted: m });
                db.updateCoins(userId, -cost);
                db.updateLevel(userId, user.level + n);
                return sock.sendMessage(from, { text: `🆙 Naik level *+${n}* -> Level ${user.level + n}!\n💰 -${fmtKoin(cost)} Koin` }, { quoted: m });
            }
            if (cmd === 'belipulau') {
                const islands = db.getIslands();
                const ownedIslands = db.getUserIslands(userId);
                if (param) {
                    const id = parseInt(param);
                    const island = islands.find(i => i.id === id);
                    if (!island) return sock.sendMessage(from, { text: `❌ Pulau ${id} tidak ditemukan.` }, { quoted: m });
                    if (ownedIslands.includes(id)) return sock.sendMessage(from, { text: `❌ Pulau ini sudah kamu beli.` }, { quoted: m });
                    if (user.coins < island.price) return sock.sendMessage(from, { text: `❌ Kurang Koin! ${island.name} butuh *${fmtKoin(island.price)}*.` }, { quoted: m });
                    db.updateCoins(userId, -island.price);
                    db.buyIsland(userId, id);
                    db.setIsland(userId, id);
                    db.updateLuck(userId, island.luckBonus);
                    return sock.sendMessage(from, { text: `🏝️ Membeli & pindah ke *${island.name}*!\n🍀 Luck bonus: +${island.luckBonus}` }, { quoted: m });
                }
                let txt = `┌───「 🏝️ TOKO PULAU 」───┐\n`;
                islands.forEach(i => {
                    const mark = ownedIslands.includes(i.id) ? ' ✅' : '';
                    txt += `│ ${i.id}. ${i.name} — ${fmtKoin(i.price)} (+${i.luckBonus} Luck)${mark}\n`;
                });
                txt += `└────────────────────────┘\n\n💡 *Beli:* .belipulau <id>`;
                return sock.sendMessage(from, { text: txt }, { quoted: m });
            }
            if (cmd === 'rank') {
                const medals = ['🥇', '🥈', '🥉'];
                const top = db.getLeaderboard(10);
                let txt = `┌───「 🏆 LEADERBOARD SAGARA 」───┐\n`;
                txt += `│   Top 10 Pemancing Terkaya    │\n`;
                txt += `├───────────────────────────────┤\n`;
                top.forEach((u, i) => {
                    const medal = medals[i] || `#${i + 1}`;
                    txt += `│ ${medal} *${u.username}*\n`;
                    txt += `│    💰 ${fmtKoin(u.coins + u.asset_value)}   🆙 Lv ${u.level}\n`;
                    txt += `│    💵 ${fmtKoin(u.coins)} + 💎 ${fmtKoin(u.asset_value)}\n`;
                    txt += `│    🎣 Rod T${u.rod_tier}   🐟 ${u.total_catches.toLocaleString()}\n`;
                    txt += `├───────────────────────────────┤\n`;
                });
                const pos = db.getUserRank(userId);
                txt += `│ 📍 Posisi kamu: #${pos}\n`;
                txt += `└───────────────────────────────┘`;
                return sock.sendMessage(from, { text: txt }, { quoted: m });
            }
            if (cmd === 'museum') {
                const sub = args[1];
                if (sub === 'pasang') {
                    const invId = parseInt(args[2], 10);
                    const price = parseInt(args[3], 10);
                    if (!invId || !price || price < 1) return sock.sendMessage(from, { text: `📸 *Pasang ke Museum:*\n\nCara: *.museum pasang <id> <harga>*\nContoh: *.museum pasang 12 500000*\n\nAmbil <id> dari daftar *.inventory*.` }, { quoted: m });
                    const r = db.addMuseumItem(userId, invId, price);
                    if (!r.ok) return sock.sendMessage(from, { text: `❌ ${r.msg}` }, { quoted: m });
                    return sock.sendMessage(from, { text: `✅ Ikan berhasil dipamerkan di museummu! 🏛️\n💰 Harga: *${fmtKoin(price)} Koin*` }, { quoted: m });
                }
                if (sub === 'lepas') {
                    const id = parseInt(String(args[2] || '').replace(/[^0-9]/g, ''), 10);
                    if (!id) return sock.sendMessage(from, { text: `📸 *Lepas dari Museum:*\n\nCara: *.museum lepas <kode>*\nContoh: *.museum lepas 3* atau *.museum lepas MB-3*\n\nKode museum terlihat di daftar museum.` }, { quoted: m });
                    const r = db.removeMuseumItem(userId, id);
                    if (!r.ok) return sock.sendMessage(from, { text: `❌ Kode museum tidak ditemukan di museum kamu.` }, { quoted: m });
                    return sock.sendMessage(from, { text: `✅ Ikan dilepas dari museum dan kembali ke inventory.` }, { quoted: m });
                }
                const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
                let targetId = userId;
                let targetName = user.username;
                if (mentioned && mentioned[0]) {
                    targetId = mentioned[0].replace(/[^0-9]/g, '');
                    const targetUser = db.getUser(targetId);
                    if (!targetUser) return sock.sendMessage(from, { text: `❌ User tersebut belum terdaftar.` }, { quoted: m });
                    targetId = targetUser.user_id;
                    targetName = targetUser.username;
                } else if (sub) {
                    const found = db.getUserByUsername(param);
                    if (!found) return sock.sendMessage(from, { text: `❌ Nama *${param}* tidak ditemukan. Coba: *.museum @mention*` }, { quoted: m });
                    targetId = found.user_id;
                    targetName = found.username;
                }
                const items = db.getMuseum(targetId);
                let txt = `◈━━━━━━━━ 🏛️ MUSEUM ━━━━━━━━◈\n`;
                txt += `│ ✨ Pemilik  : *${targetName}*\n`;
                txt += `│ 🖼️ Koleksi   : ${items.length} ikan\n`;
                if (items.length > 0) txt += `│ 💰 Nilai total: ${fmtKoin(items.reduce((s, i) => s + i.price, 0))} Koin\n`;
                txt += `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
                if (items.length === 0) txt += `│   (Belum ada ikan dipamerkan)\n`;
                items.forEach((it, i) => {
                    const num = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'][i] || `${i + 1}.`;
                    txt += `│ ${num} ${it.emoji} *${it.name}*\n`;
                    txt += `│      💠 Tier ${it.tier} · ${it.tier_name}\n`;
                    txt += `│      ⚖️ ${it.weight}kg   💎 ${fmtKoin(it.price)} Koin\n`;
                    txt += `│      🆔 Kode: MB-${it.id}\n`;
                    txt += `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
                });
                txt += `💡 Mau koleksi ikan ini? Ketik: *.beli <kode>*\n`;
                if (targetId === userId) txt += `🏛️ Atur museum:\n• *.museum pasang <id> <harga>*\n• *.museum lepas <kode>*\n`;
                else txt += `🏛️ Lihat museum sendiri: *.museum*`;
                txt += `◈━━━━━━━━━━━━━━━━━━━━━━━━━━━━◈`;
                return sock.sendMessage(from, { text: txt }, { quoted: m });
            }
            if (cmd === 'trading') {
                const fmt = (n) => {
                    if (n >= 1e12) return (n / 1e12).toFixed(2).replace(/\.?0+$/, '') + ' T';
                    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' M';
                    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + ' Jt';
                    return Math.round(n).toLocaleString();
                };
                const sub = args[1];
                const sym = String(args[2] || '').toUpperCase();
                if (sub === 'beli') {
                    const qty = args[3] === undefined ? 1 : Math.floor(parseFloat(args[3]));
                    const r = db.buyAsset(userId, sym, qty);
                    if (!r.ok) return sock.sendMessage(from, { text: `❌ ${r.msg}` }, { quoted: m });
                    return sock.sendMessage(from, { text: `💹 *BELI ASET BERHASIL!*\n💠 ${r.amount} × *${r.name} (${r.symbol})*\n💰 Total: -${fmtKoin(r.total)} Koin (${fmtPrice(r.price)}/unit)\n💰 Sisa saldo: ${fmtKoin(user.coins - r.total)} Koin` }, { quoted: m });
                }
                if (sub === 'jual') {
                    const all = (args[3] || '').toLowerCase() === 'semua';
                    const qty = args[3] === undefined ? 1 : (all ? Infinity : Math.floor(parseFloat(args[3])));
                    const r = db.sellAsset(userId, sym, qty);
                    if (!r.ok) return sock.sendMessage(from, { text: `❌ ${r.msg}` }, { quoted: m });
                    return sock.sendMessage(from, { text: `💹 *JUAL ASET BERHASIL!*\n💠 ${r.amount} × *${r.name} (${r.symbol})*\n💰 +${fmtKoin(r.total)} Koin (${fmtPrice(r.price)}/unit)` }, { quoted: m });
                }
                const prices = db.getAssetPrices();
                const myAssets = db.getUserAssets(userId);
                const assetValue = db.getAssetValue(userId);
                let txt = `┌───「 📈 PASAR TRADING 」───┐\n`;
                txt += `│ 💰 Tunai : ${fmtKoin(user.coins)} Koin\n`;
                txt += `│ 💎 Aset  : ${fmtKoin(assetValue)} Koin   (${myAssets.length} jenis)\n`;
                txt += `├──── 💼 PORTFOLIO KAMU ──────┤\n`;
                if (myAssets.length === 0) {
                    txt += `│ (Kosong — coba: .trading beli BTC 1)\n`;
                } else {
                    myAssets.forEach(a => {
                        const p = prices.find(x => x.symbol === a.symbol);
                        const dot = p && p.changePct > 0 ? '🟢' : p && p.changePct < 0 ? '🔴' : '⚪';
                        txt += `│ ${dot} *${a.name}* (${a.symbol})\n`;
                        txt += `│    ${a.amount} unit = ${fmt(a.value)} Koin\n`;
                    });
                }
                txt += `├────── 📊 HARGA PASAR ──────┤\n`;
                const groups = ['Komoditas', 'Mata Uang', 'Kripto'];
                groups.forEach(g => {
                    const list = prices.filter(p => p.type === g);
                    if (!list.length) return;
                    txt += `│ ${g === 'Kripto' ? '🪙 KRIPTO' : g === 'Komoditas' ? '🌴 KOMODITAS' : '💱 MATA UANG'}\n`;
                    list.forEach(p => {
                        const held = myAssets.find(a => a.symbol === p.symbol);
                        const dot = p.changePct > 0 ? '🟢' : p.changePct < 0 ? '🔴' : '⚪';
                        txt += `│ ${dot} ${p.symbol.padEnd(4)} ${p.name.padEnd(15)} ${fmt(p.price).padStart(7)} ${(p.changePct >= 0 ? '+' : '') + p.changePct}%${held ? ` ✓x${held.amount}` : ''}\n`;
                    });
                });
                txt += `├────────────────────────────┤\n`;
                txt += `│ 📝 Harga otomatis berubah tiap *15 menit* (naik/turun 1–100%)\n`;
                txt += `│ 💡 Beli: .trading beli BTC 5 (tanpa angka = 1)\n│ 💡 Jual: .trading jual BTC 5 | BTC semua\n`;
                txt += `└────────────────────────────┘`;
                return sock.sendMessage(from, { text: txt }, { quoted: m });
            }
            if (cmd === 'beli') {
                const id = parseInt(String(param).replace(/[^0-9]/g, ''), 10);
                if (!id) return sock.sendMessage(from, { text: `🛒 Cara beli koleksi museum:\n\n*.beli <kode>*\nContoh: *.beli 3* atau *.beli MB-3*\n\nKode didapat dari daftar museum pemilik.` }, { quoted: m });
                const r = db.buyMuseumItem(userId, id);
                if (!r.ok) return sock.sendMessage(from, { text: `❌ ${r.msg}` }, { quoted: m });
                return sock.sendMessage(from, { text: `🛒 *TRANSAKSI BERHASIL!*\n${r.fish.emoji} *${r.fish.name}* (${r.fish.weight}kg) berpindah ke inventory kamu!\n💠 Tier ${r.fish.tier} · ${r.fish.tier_name}\n💰 -${r.price.toLocaleString()} Koin\n🏠 Dibeli dari museum: *${r.ownerName}*` }, { quoted: m });
            }
            if (cmd === 'activator' || cmd === 'cooldown') {
                if (cmd === 'cooldown') {
                    const boostMs = db.getCooldownBoostMs(userId);
                    const baseCd = (user.rod_tier || 1) <= 15 ? '7 detik' : '1-3 detik';
                    return sock.sendMessage(from, { text: `⚡ *STATUS COOLDOWN*\n\n🎣 Rod kamu (T${user.rod_tier || 1}): *${baseCd}*\n\n${boostMs > 0 ? `⚡ Activator aktif → *1 detik*\n🕐 Sisa: *${Math.ceil(boostMs / 60000)} menit*` : '💤 Activator tidak aktif.\nBeli: *.activator* (30 mnt · 25 Jt) / *.activator 5* (5 mnt · 5 Jt)'}` }, { quoted: m });
                }
                const minutes = parseInt(param, 10);
                const is5 = minutes === 5;
                const cost = is5 ? 5000000 : 25000000;
                if (user.coins < cost) return sock.sendMessage(from, { text: `❌ Kurang Koin! Butuh *${fmtKoin(cost)} Koin* untuk Activator.\n${is5 ? 'Varian lain: *.activator* (30 mnt · 25 Jt)' : 'Varian lain: *.activator 5* (5 mnt · 5 Jt)'}` }, { quoted: m });
                db.updateCoins(userId, -cost);
                const expires = db.activateCooldownBoost(userId, is5 ? 5 : 30);
                const mins = Math.round((expires - Date.now()) / 60000);
                return sock.sendMessage(from, { text: `⚡ *COOLDOWN ACTIVATOR AKTIF!*\n💰 -${fmtKoin(cost)} Koin\n⏱️ Cooldown semua rod → *1 detik* selama *${mins} menit*.` }, { quoted: m });
            }
            if (cmd === 'inventory' || cmd === 'bag' || /^inventory\d+$/.test(cmd) || /^bag\d+$/.test(cmd)) {
                const perPage = 15;
                const mIdx = cmd.match(/^inventory(\d+)$/) || cmd.match(/^bag(\d+)$/);
                let page = mIdx ? parseInt(mIdx[1]) : (parseInt(param) || 1);
                const total = db.getInventoryCount(userId);
                const totalPages = Math.max(1, Math.ceil(total / perPage));
                page = Math.min(Math.max(1, page), totalPages);
                const inv = db.getInventory(userId, page, perPage);
                let txt = `┌───「 🎒 INVENTORY ${page}/${totalPages} 」───┐\n`;
                if (!inv.items || inv.items.length === 0) txt += `│ *Inventory kosong!* Mancing lagi sana!\n`;
                else inv.items.forEach((it, i) => txt += `│ ${(page - 1) * perPage + i + 1}. ${it.emoji} *${it.name}* (${it.weight}kg) | [ID: ${it.id}]\n`);
                txt += `└──────────────────────────┘\n`;
                if (totalPages > 1) txt += `📄 *Halaman ${page}/${totalPages}* dari total ${total} ikan.\n💡 Halaman berikutnya: *.inventory${page + 1}*\n`;
                txt += `💡 *Pakai:* .jual <id> | .jual semua | .jualjenisikan <nama>`;
                return sock.sendMessage(from, { text: txt }, { quoted: m });
            }
            if (cmd === 'jual') {
                const inv = db.getInventory(userId, 1, 1000);
                if (!inv.items || inv.items.length === 0) return sock.sendMessage(from, { text: `🎒 Inventory kosong.` }, { quoted: m });
                let soldCount = 0, totalCoins = 0;
                if (param === 'semua') inv.items.forEach(it => { const r = db.sellFish(userId, it.id); if (r) { soldCount++; totalCoins += r.price; }});
                else if (param === 'tier1') inv.items.filter(it => it.tier === 1).forEach(it => { const r = db.sellFish(userId, it.id); if (r) { soldCount++; totalCoins += r.price; }});
                else if (param === 'biasa') inv.items.filter(it => it.tier_name === 'Biasa').forEach(it => { const r = db.sellFish(userId, it.id); if (r) { soldCount++; totalCoins += r.price; }});
                else if (param === 'legend') inv.items.filter(it => it.tier >= 7).forEach(it => { const r = db.sellFish(userId, it.id); if (r) { soldCount++; totalCoins += r.price; }});
                else { const res = db.sellFish(userId, parseInt(param)); if (res) { soldCount = 1; totalCoins = res.price; } }
                return sock.sendMessage(from, { text: soldCount > 0 ? `✅ Berhasil jual *${soldCount}* ikan senilai *${fmtKoin(totalCoins)} Koin*!` : `❌ Ikan tidak ditemukan.` }, { quoted: m });
            }
            if (cmd === 'jualjenisikan' || (cmd === 'jualjenis' && (args[1] || '') === 'ikan')) {
                const n = (cmd === 'jualjenisikan' ? param : args.slice(2).join(' ')).trim();
                if (!n) return sock.sendMessage(from, { text: `💡 *Jual semua ikan sejenis:*\n\n*.jualjenisikan <nama ikan>*\nContoh: *.jualjenisikan lele*\n\nSemua ikan bernama *lele* di inventory kamu akan terjual.` }, { quoted: m });
                const r = db.sellFishByName(userId, n);
                if (!r.ok) return sock.sendMessage(from, { text: `❌ Ikan yang kamu cari *${n}* tidak ada di inventory kamu.\nCek daftar ikanmu: *.inventory*` }, { quoted: m });
                const namaTampil = r.names.join(', ');
                return sock.sendMessage(from, { text: `✅ Terjual *${r.count} ekor* ikan *${namaTampil}*!\n💰 Total: +${fmtKoin(r.total)} Koin` }, { quoted: m });
            }
            if (cmd === 'pindahpulau') {
                const islands = db.getSessionIslands();
                const cur = db.getSessionIslandKey(userId);
                const net = db.getNetWorth(userId);
                if (!param) {
                    let t = `┌───「 🏝️ SESI PULAU 」───┐\n📍 Kamu sekarang di: *${db.getSessionIsland(cur).name}*\n\n`;
                    islands.forEach(isl => {
                        const isCur = isl.key === cur ? ' ✅' : '';
                        t += `${isCur ? '▸' : ' '} *${isl.name}*${isCur}\n`;
                        t += `   🎣 Ikan tier: ${isl.tiers.join('-')}\n`;
                        const reqs = [];
                        if (isl.reqLevel) reqs.push(`Level ${isl.reqLevel.toLocaleString()}`);
                        if (isl.reqNetWorth) reqs.push(`Harta ${fmtKoin(isl.reqNetWorth)}`);
                        if (isl.reqRodTiers.length) reqs.push(`Rod seri ${isl.reqRodTiers[0]}-${isl.reqRodTiers[isl.reqRodTiers.length - 1]}`);
                        t += `   🔒 ${reqs.length ? reqs.join(' + ') : 'Bebas'}\n`;
                    });
                    t += `└────────────────────────┘\n\n💡 *Pindah:* .pindahpulau <nama>\nContoh: .pindahpulau demonangel`;
                    return sock.sendMessage(from, { text: t }, { quoted: m });
                }
                const isl = islands.find(i => i.key.startsWith(param.toLowerCase())) || islands.find(i => i.name.toLowerCase().includes(param.toLowerCase()));
                if (!isl) return sock.sendMessage(from, { text: `❌ Pulau *${param}* tidak ada.\nKetik *.pindahpulau* untuk lihat daftar.` }, { quoted: m });
                if (isl.key === cur) return sock.sendMessage(from, { text: `✅ Kamu sudah di *${isl.name}*.` }, { quoted: m });
                const unmet = [];
                if (user.level < isl.reqLevel) unmet.push(`Level minimal ${isl.reqLevel.toLocaleString()} (kamu ${user.level})`);
                if (net < isl.reqNetWorth) unmet.push(`Total harta minimal ${fmtKoin(isl.reqNetWorth)} (kamu ${fmtKoin(net)})`);
                if (isl.reqRodTiers.length && !db.ownsRodTier(userId, isl.reqRodTiers)) unmet.push(`Butuh rod seri tier ${isl.reqRodTiers[0]}-${isl.reqRodTiers[isl.reqRodTiers.length - 1]}`);
                if (unmet.length) {
                    let t = `⛔ *Tidak bisa pindah ke ${isl.name}.*\nSyarat belum terpenuhi:\n`;
                    unmet.forEach(u => t += `❌ ${u}\n`);
                    return sock.sendMessage(from, { text: t }, { quoted: m });
                }
                db.setSessionIsland(userId, isl.key);
                return sock.sendMessage(from, { text: `🏝️ *Pindah pulau berhasil!*\n📍 Kamu sekarang di: *${isl.name}*\n🎣 Ikan di sini: tier ${isl.tiers.join('-')}\n\n💾 Ini sesi kamu — kamu mancing di sini terus sampai pindah lagi (*.pindahpulau*).` }, { quoted: m });
            }
            if (cmd === 'mancing') {
                const boostMs = db.getCooldownBoostMs(userId);
                let cd;
                if (boostMs > 0) cd = 1000;
                else if ((user.rod_tier || 1) <= 15) cd = 7000;
                else cd = 1000 + Math.floor(Math.random() * 2001);
                const elapsed = Date.now() - (user.last_fish_time || 0);
                if (elapsed < cd) {
                    const s = Math.ceil((cd - elapsed) / 1000);
                    return sock.sendMessage(from, { text: `⏳ *Tunggu ${s} detik lagi!*\n${boostMs > 0 ? '⚡ Cooldown Activator aktif → 1 detik' : `🎣 Rod kamu cooldown ${(cd / 1000).toFixed(0)}s`}` }, { quoted: m });
                }
                const fish = db.getRandomFishBySessionIsland(user.rod_tier || 1, db.getSessionIsland(db.getSessionIslandKey(userId)), user.luck || 0) || db.getRandomFishByTier(1, 0);
                const weight = +(Math.random() * (fish.weight_max - fish.weight_min) + fish.weight_min).toFixed(2);
                db.addInventory(userId, fish.id, weight);
                db.updateLastFishTime(userId);
                return sock.sendMessage(from, { text: `🎣 *BERHASIL MEMANCING!*\n${fish.emoji} *${fish.name}* (${weight}kg)` }, { quoted: m });
            }
            if (cmd === 'gacha' || cmd === 'gacha2') {
                const isG2 = cmd === 'gacha2';
                let txt = `┌───「 🎰 ${isG2 ? 'GACHA PREMIUM' : 'GACHA STANDAR'} 」───┐\n│ ✨ *Rate Up:* ${isG2 ? 'Cassy' : 'Lilith/Rafael'}\n│ 🛡️ *Pity:* 200-300 Roll\n│ 💰 *Harga:* ${isG2 ? '2 Juta' : '500 Ribu'}/roll\n└─────────────────────┘\n\n⌨️ *Cara Roll:*\n\.roll${isG2 ? '2' : '1'} 1 (1x) / 10 (10x)`;
                return sock.sendMessage(from, { text: txt }, { quoted: m });
            }
            if (cmd === 'roll1' || cmd === 'roll2') {
                const isR2 = cmd === 'roll2';
                const count = parseInt(param) || 1;
                const cost = (isR2 ? 2000000 : 500000) * count;
                if (user.coins < cost) return sock.sendMessage(from, { text: `❌ Kurang Koin!` }, { quoted: m });
                db.updateCoins(userId, -cost);
                let results = [];
                for (let i = 0; i < count; i++) {
                    const pk = userId + (isR2 ? 'roll2' : 'roll1');
                    const target = db.getPityTarget(pk, 200, 300);
                    const pity = db.getPity(pk) + 1;
                    let rw = null;
                    if (isR2) {
                        if (pity >= target) { rw = { id: 0, rodTier: 37, name: "Cassy the Lady Angel (Rod)", emoji: "👼" }; db.resetPity(pk); }
                        else { const f = db.getRandomFishByTier(10, 0); rw = f ? { id: f.id, name: f.name, emoji: f.emoji } : null; db.setPity(pk, pity); }
                    } else {
                        if (pity >= target) { rw = { id: 0, rodTier: Math.random() < 0.5 ? 36 : 35, name: Math.random() < 0.5 ? "Lilith the Demon (Rod)" : "Rafael the Angel (Rod)", emoji: "⚔️" }; db.resetPity(pk); }
                        else { const f = db.getRandomFishByTier(7, 0); rw = f ? { id: f.id, name: f.name, emoji: f.emoji } : null; db.setPity(pk, pity); }
                    }
                    if (rw) {
                        results.push(`• ${rw.emoji} *${rw.name}*`);
                        if (rw.id > 0) db.addInventory(userId, rw.id, 10.0);
                        if (rw.rodTier) { db.addRod(userId, rw.rodTier, rw.name); db.updateRodTier(userId, rw.rodTier); }
                    }
                }
                return sock.sendMessage(from, { text: `🎰 *HASIL ROLL (${count}x)*\n\n${results.join('\n')}` }, { quoted: m });
            }
        } catch (err) { console.error(err); }
    });
    }
    await connectToWhatsApp();
}
startWhatsApp();
setInterval(announcePriceUpdates, 20000);
startPhantomAnglers();
console.log('🤖 Bot Sagara Fishing Running');
