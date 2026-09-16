# 🎣 SAGARA FISHING

> Bot *fishing* WhatsApp bergaya game RNG Indonesia — cari ikan, kumpulkan Koin, gacha rod legendaris, dan pamerin tangkapanmu di Museum.

Ditenagai **Node.js** ⚡ + **Baileys** + **SQLite**, dijalankan 24/7 via **PM2** dengan 12 `phantom angler` NPC yang ikut memancing di belakang layar.

---

## ✨ Fitur Keren

| Fitur | Detail |
|---|---|
| 🐟 **300+ Ikan Indonesia** | 7 tier: Common → Uncommon → Rare → Epic → Legendary → Mythic → Divine |
| 🎲 **RNG Dua Lapis** | Weighted RNG pemilihan ikan × Power-curve berat (`random^2/3`) biar ikan raksasa bener-bener langka |
| 🍀 **Stat Luck** | Berubah dari tritip pulau & item, mempengaruhi peluang ikat ikan langka |
| 🎏 **Gacha Rod + Pity** | Pity acak 200–300 jam, jackpot rod spesial **Rafael**, **Lilith** & **Cassy** |
| 🛒 **Ekonomi Lengkap** | Toko rod (Tier 1–26), beli level, beli & pindah pulau (bonus luck 50–1000) |
| ⏱️ **Cooldown Rod** | Tier 1–15: 7 dtk · Tier 16+: 1–3 dtk, atau pakai **Cooldown Activator** (5 mnt/5Jt · 30 mnt/25Jt) biar 1 detik |
| 🏛️ **Museum Publik** | Pasang ikan pameran, harga jual-beli antar pemain via `.museum` & `.beli` |
| 🗃️ **Inventory** | Pagination per 15 ikan, jual semua sampai 1000 sekaligus |
| 🏆 **Rank / Leaderboard** | Medal 🥇🥈🥉, format Koin ringkas (Ku/T/M/Jt), NPC phantom auto-diexclude |
| 👥 **Sistem Daftar** | User baru wajib `.daftar <nama>` sebelum main |
| 👻 **Phantom Anglers** | 12 NPC (900000–900011) yang memancing sendiri supaya dunia terasa hidup |

---

## 🧰 Perintah

```
.menu            • menu & info dirimu
.daftar <nama>   • daftar / ganti nama (max 15 huruf)
.mancing         • memancing (ada cooldown!)
.inventory       • lihat 15 ikan pertama (.inventory2, .inventory3, ...)
.setpancingan    • ganti rod aktif
.toko            • lihat/beli rod (.toko 5 untuk tier 5)
.belilevel <n>   • naik level
.belipulau       • beli/pindah pulau baru (bonus luck)
.gacha           • gacha rod (pity 200–300)
.museum          • lihat museum (.museum lilith, .museum pasang/lepas)
.beli MB-<kode>  • beli ikan dari museum pemain lain
.rank            • leaderboard
.profile         • profil lengkap dirimu
.activator       • cooldown 1 detik (30 mnt · 25 Jt) | .activator 5 (5 mnt · 5 Jt)
.cooldown        • status cooldown & sisa waktu activator
```

---

## 🚀 Cara Pasang (Installasi)

**1. Prasyarat**

- **Node.js v18+** & **npm** → download dari [nodejs.org](https://nodejs.org)
- **PM2** untuk proses daemon — `npm i -g pm2`
- Nomor WhatsApp untuk bot (disarankan nomor terpisah dari nomor pribadi)

**2. Ambil project**

```bash
git clone https://github.com/lilith-sagara/sagarafishing.git
cd sagarafishing
```

**3. Install dependency**

```bash
npm install
```

**4. Hubungkan WhatsApp (pairing)**

```bash
node bot.js
```

Jalankan pertama kali akan muncul **QR** di terminal. Buka WhatsApp di HP → *Setelan* → *Perangkat tertaut* → *Hubungkan perangkat* → scan QR-nya. Setelah muncul `✅ WhatsApp terhubung`, bot sudah online.

> Folder `session_wa/` akan tersimpan otomatis — jangan pernah di-commit ke repo / dibagikan!

**5. Jalankan 24/7 dengan PM2** (opsional tapi disarankan)

```bash
pm2 start bot.js --name sagara-fishing --cron-restart "0 */6 * * *"
pm2 save
pm2 logs sagara-fishing   # pantau log
pm2 restart sagara-fishing
```

**6. (Opsional) Nyalakan Phantom Anglers**

Otomatis aktif saat bot start — 12 NPC mulai memancing di belakang layar. Jumlah & jadwal ada di `phantom_anglers.js`.

---

## 📁 Struktur Project

```
sagarafishing/
├── bot.js              # Entry point & semua handler command
├── database.js         # Schémas SQLite + logika ekonomi/museum/rank
├── keyboards.js        # Data + daftar rod (Tier 1–26 & gacha 35/36/37)
├── phantom_anglers.js  # NPC phantom angler
├── fish_data.json      # Data 300+ ikan (7 tier)
├── rods.json           # Data rod tambahan
├── package.json        # Dependency Node.js
├── seed_*.js           # Script seed data event/sky
└── assets/             # Asset logo bot
```

---

## 🤝 Kontributor

Project ini berdiri di atas bahu raksasa. Terima kasih khusus kepada:

- **Node.js** — runtime utama yang menghidupi seluruh bot ini ☕
- **Baileys (ourin-baileys)** — perpustakaan WhatsApp Web
- **better-sqlite3** — SQLite sinkron nan cepat untuk Node.js
- **PM2** — penjaga bot tetap hidup 24/7
- Semua mantan user Telegram *(bot ini bermula sebagai bot Python/Telegram, lalu melompat total ke WhatsApp + Node.js)*

Mau ikut nyumbang? Buka *issue*, atau kirim *pull request* — terutama penajaman RNG, keseimbangan ekonomi ikan, dan fitur turnamen. 🎣

---

## 📜 Lisensi

Dibuat untuk kesenangan komunitas game bot. Data & aset bersifat open untuk dipelajari; hindari penyalahgunaan.