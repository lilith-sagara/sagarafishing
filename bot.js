const dotenv = require('dotenv');
dotenv.config();
const { Telegraf } = require('telegraf');
const pino = require('pino');
const db = require('./database.js');
const fs = require('fs');
const { RODS, getMainMenuKeyboard } = require('./keyboards.js');
const { startPhantomAnglers } = require('./phantom_anglers.js');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

let menuThumb = null;
async function loadMenuThumb() {
    if (menuThumb) return menuThumb;
    const hostO = 'u.p' + String.fromCharCode(111) + 'ne.rs';
    const host0 = 'u.p' + String.fromCharCode(48) + 'ne.rs';
    const urls = [`https://${hostO}/drcgmyad.jpg`, `https://${host0}/drcgmyad.jpg`];
    for (const url of urls) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) continue;
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 0 && buf.subarray(0, 2).toString('hex') === 'ffd8') {
                menuThumb = buf;
                console.log(`✅ Thumbnail menu dimuat (${buf.length} bytes)`);
                break;
            }
        } catch (e) {
            console.warn('⚠️ Gagal muat thumbnail menu:', e.message);
        }
    }
    return menuThumb;
}

function getMenuText(user) {
    const activeRod = RODS.find(r => r.tier === (user.rod_tier || 1));
    const invCount = db.getInventoryCount(user.user_id);
    return `╭━─━─━─━─━─━─━─━─━─━─━─━─━╮
║       🌊 *S A G A R A* 🌊       ║
║   🐟 *F I S H I N G   B O T*   ║
║  Serunya nangkap ikan jutaan!  ║
╰━─━─━─━─━─━─━─━─━─━─━─━─━╯

╭╮ 🔍 INFO PEMANCING
││ 🧑 Nama      : *${user.username}*
││ 💰 Koin      : ${user.coins.toLocaleString()}
││ 🆙 Level     : ${user.level}
││ 🎣 Pancingan : ${activeRod?.name || 'Rod Tier ' + (user.rod_tier || 1)}
││ 🎒 Ikan      : ${invCount} ekor
╰╯

╭╮ 🎣 FITUR UTAMA
││ ▸ .mancing          Langsung mancing!
││ ▸ .setpancingan     Atur pancingan aktif
││ ▸ .inventory        Lihat simpanan ikan
││ ▸ .museum           Pamer & jual koleksi
││ ▸ .toko             Beli pancingan baru
││ ▸ .gacha / .gacha2  Gacha rod langka
╰╯

╭╮ 🧰 LAIN-LAIN
││ ▸ .beli   .belilevel   .belipulau
││ ▸ .activator   .cooldown   .profile
││ ▸ .rank   .daftar
╰╯

♪ Selamat mancing-mancing, Nak! 🐙`;
}

async function startWhatsApp() {
    const { makeWASocket, useMultiFileAuthState, fetchLatestWaWebVersion, makeCacheableSignalKeyStore, DisconnectReason } = await import('ourin-baileys');
    const { state, saveCreds } = await useMultiFileAuthState('./session_wa');
    const { version } = await fetchLatestWaWebVersion();

    async function connectToWhatsApp() {
        const sock = makeWASocket({ version, logger: pino({ level: 'silent' }), printQRInTerminal: true, auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) }, browser: ["Ubuntu", "Chrome", "20.0.04"] });
        sock.ev.on('creds.update', saveCreds);
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
            const userId = (m.key.participant || from || '').replace(/[^0-9]/g, '');
            if (!text.startsWith('.')) return;
            const args = text.slice(1).split(' ');
            const cmd = args[0];
            const param = args.slice(1).join(' ');
            let user = db.getUser(userId);
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
                const thumb = await loadMenuThumb();
                const msgOpts = thumb
                    ? { text: getMenuText(user), contextInfo: { externalAdReply: { title: '🌊 SAGARA FISHING', body: '🐟 Bot Memancing Paling Seru', sourceUrl: 'https://wa.me/6285716348564', mediaType: 1, thumbnail: thumb, renderLargerThumbnail: true }, mentionedJid: [from] } }
                    : { text: getMenuText(user) };
                return sock.sendMessage(from, msgOpts, { quoted: m });
            }
            if (cmd === 'profile') {
                return sock.sendMessage(from, { text: `┌───「 *PROFIL PEMANCING* 」───┐\n│ 👤 *Nama:* ${user.username}\n│ 💰 *Saldo:* ${user.coins.toLocaleString()} Koin\n│ 🆙 *Level:* ${user.level}\n│ 🎣 *Rod Tier:* ${user.rod_tier || 1}\n└────────────────────────┘` }, { quoted: m });
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
                    if (user.coins < rod.price) return sock.sendMessage(from, { text: `❌ Kurang Koin! Butuh *${rod.price.toLocaleString()}*.` }, { quoted: m });
                    db.updateCoins(userId, -rod.price);
                    db.addRod(userId, tier, rod.name);
                    db.updateRodTier(userId, tier);
                    return sock.sendMessage(from, { text: `✅ Membeli *${rod.name}* seharga *${rod.price.toLocaleString()} Koin*!\n🎣 Otomatis dipasang.` }, { quoted: m });
                }
                const buyable = RODS.filter(r => r.price > 0);
                let txt = `┌───「 🏪 TOKO PANCINGAN 」───┐\n`;
                buyable.slice(0, 26).forEach(r => {
                    const ownedMark = owned.some(o => o.rod_tier === r.tier) ? ' ✅' : '';
                    txt += `│ ${r.tier}. ${r.name} — ${r.price.toLocaleString()}${ownedMark}\n`;
                });
                txt += `└──────────────────────────┘\n\n💡 *Beli:* .toko <tier>`;
                return sock.sendMessage(from, { text: txt }, { quoted: m });
            }
            if (cmd === 'belilevel') {
                const n = parseInt(param) || 1;
                const cost = n * (user.level + 1) * 500000;
                if (user.coins < cost) return sock.sendMessage(from, { text: `❌ Kurang Koin! Butuh *${cost.toLocaleString()}* untuk ${n} level.` }, { quoted: m });
                db.updateCoins(userId, -cost);
                db.updateLevel(userId, user.level + n);
                return sock.sendMessage(from, { text: `🆙 Naik level *+${n}* -> Level ${user.level + n}!\n💰 -${cost.toLocaleString()} Koin` }, { quoted: m });
            }
            if (cmd === 'belipulau') {
                const islands = db.getIslands();
                const ownedIslands = db.getUserIslands(userId);
                if (param) {
                    const id = parseInt(param);
                    const island = islands.find(i => i.id === id);
                    if (!island) return sock.sendMessage(from, { text: `❌ Pulau ${id} tidak ditemukan.` }, { quoted: m });
                    if (ownedIslands.includes(id)) return sock.sendMessage(from, { text: `❌ Pulau ini sudah kamu beli.` }, { quoted: m });
                    if (user.coins < island.price) return sock.sendMessage(from, { text: `❌ Kurang Koin! ${island.name} butuh *${island.price.toLocaleString()}*.` }, { quoted: m });
                    db.updateCoins(userId, -island.price);
                    db.buyIsland(userId, id);
                    db.setIsland(userId, id);
                    db.updateLuck(userId, island.luckBonus);
                    return sock.sendMessage(from, { text: `🏝️ Membeli & pindah ke *${island.name}*!\n🍀 Luck bonus: +${island.luckBonus}` }, { quoted: m });
                }
                let txt = `┌───「 🏝️ TOKO PULAU 」───┐\n`;
                islands.forEach(i => {
                    const mark = ownedIslands.includes(i.id) ? ' ✅' : '';
                    txt += `│ ${i.id}. ${i.name} — ${i.price.toLocaleString()} (+${i.luckBonus} Luck)${mark}\n`;
                });
                txt += `└────────────────────────┘\n\n💡 *Beli:* .belipulau <id>`;
                return sock.sendMessage(from, { text: txt }, { quoted: m });
            }
            if (cmd === 'rank') {
                const fmtCoins = (n) => {
                    if (n >= 1e15) return (n / 1e15).toFixed(2).replace(/\.?0+$/, '') + ' Ku';
                    if (n >= 1e12) return (n / 1e12).toFixed(2).replace(/\.?0+$/, '') + ' T';
                    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' M';
                    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + ' Jt';
                    return n.toLocaleString();
                };
                const medals = ['🥇', '🥈', '🥉'];
                const top = db.getLeaderboard(10);
                let txt = `┌───「 🏆 LEADERBOARD SAGARA 」───┐\n`;
                txt += `│   Top 10 Pemancing Terkaya    │\n`;
                txt += `├───────────────────────────────┤\n`;
                top.forEach((u, i) => {
                    const medal = medals[i] || `#${i + 1}`;
                    txt += `│ ${medal} *${u.username}*\n`;
                    txt += `│    💰 ${fmtCoins(u.coins)}   🆙 Lv ${u.level}\n`;
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
                    return sock.sendMessage(from, { text: `✅ Ikan berhasil dipamerkan di museummu! 🏛️\n💰 Harga: *${price.toLocaleString()} Koin*` }, { quoted: m });
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
                if (items.length > 0) txt += `│ 💰 Nilai total: ${items.reduce((s, i) => s + i.price, 0).toLocaleString()} Koin\n`;
                txt += `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
                if (items.length === 0) txt += `│   (Belum ada ikan dipamerkan)\n`;
                items.forEach((it, i) => {
                    const num = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'][i] || `${i + 1}.`;
                    txt += `│ ${num} ${it.emoji} *${it.name}*\n`;
                    txt += `│      💠 Tier ${it.tier} · ${it.tier_name}\n`;
                    txt += `│      ⚖️ ${it.weight}kg   💎 ${it.price.toLocaleString()} Koin\n`;
                    txt += `│      🆔 Kode: MB-${it.id}\n`;
                    txt += `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
                });
                txt += `💡 Mau koleksi ikan ini? Ketik: *.beli <kode>*\n`;
                if (targetId === userId) txt += `🏛️ Atur museum:\n• *.museum pasang <id> <harga>*\n• *.museum lepas <kode>*\n`;
                else txt += `🏛️ Lihat museum sendiri: *.museum*`;
                txt += `◈━━━━━━━━━━━━━━━━━━━━━━━━━━━━◈`;
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
                if (user.coins < cost) return sock.sendMessage(from, { text: `❌ Kurang Koin! Butuh *${cost.toLocaleString()} Koin* untuk Activator.\n${is5 ? 'Varian lain: *.activator* (30 mnt · 25 Jt)' : 'Varian lain: *.activator 5* (5 mnt · 5 Jt)'}` }, { quoted: m });
                db.updateCoins(userId, -cost);
                const expires = db.activateCooldownBoost(userId, is5 ? 5 : 30);
                const mins = Math.round((expires - Date.now()) / 60000);
                return sock.sendMessage(from, { text: `⚡ *COOLDOWN ACTIVATOR AKTIF!*\n💰 -${cost.toLocaleString()} Koin\n⏱️ Cooldown semua rod → *1 detik* selama *${mins} menit*.` }, { quoted: m });
            }
            if (cmd === 'inventory' || cmd === 'bag') {
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
                txt += `💡 *Pakai:* .jual <id> | .jual semua`;
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
                return sock.sendMessage(from, { text: soldCount > 0 ? `✅ Berhasil jual *${soldCount}* ikan senilai *${totalCoins.toLocaleString()} Koin*!` : `❌ Ikan tidak ditemukan.` }, { quoted: m });
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
                const fish = db.getRandomFishByTier(user.rod_tier || 1, user.luck || 0) || db.getRandomFishByTier(1, 0);
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
startPhantomAnglers();
console.log('🤖 Bot Sagara Fishing Running');
