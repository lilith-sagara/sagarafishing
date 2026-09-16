# 🎣 Fishing RNG Bot Telegram

Bot Telegram game mancing dengan sistem Random Number Generator (RNG) lengkap dan antarmuka **100% Inline Keyboard Buttons**.

## 📌 Fitur Utama

- **300 Jenis Ikan Bahasa Indonesia**: Terbagi ke dalam 7 Tier (Common, Uncommon, Rare, Epic, Legendary, Mythic, Divine).
- **Sistem RNG Dua Layer**:
  - **Layer 1**: Weighted RNG jenis ikan berdasarkan kasta pancingan & stat Luck player.
  - **Layer 2**: Power-curve RNG berat kilogram (random^2/3) agar berat maksimal terasa sangat langka.
- **4 Kasta Pancingan & Cooldown Dinamis**:
  - Pancing Bambu (Default): Cooldown 5.0s | Max Tier 3
  - Pancing Kayu (1.000 koin): Cooldown 4.0s | Max Tier 5
  - Pancing Fiber (25.000 koin): Cooldown 3.0s | Max Tier 6
  - Pancing Abyss (500.000 koin): Cooldown 2.5s | Max Tier 7
- **Full Inline Keyboard Interface**: Semua navigasi (Mancing, Inventory, Toko, Profil, Leaderboard, Daily Reward) tanpa perlu mengetik command text.
- **SQLite Database**: Penyimpanan data user, inventory, log tangkapan, dan data ikan lokal.

---

## 🛠️ Cara Instalasi & Setup

1. **Clone / Masuk ke Folder Project**:
   ```bash
   cd /home/lilith/sagarafishing
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Generate Data 300 Ikan**:
   *(Langkah ini otomatis saat awal, atau jalankan manual jika ingin memperbarui JSON)*
   ```bash
   python generate_fish.py
   ```

4. **Konfigurasi Telegram Bot Token**:
   Buat file `.env` di direktori utama:
   ```env
   TELEGRAM_BOT_TOKEN=8844187641:AAFG_c_ev5irpwE9NsRQKxNT7AYSv6hdnjg
   ```

5. **Jalankan Bot**:
   ```bash
   python bot.py
   ```

---

## 🎮 Struktur Project

```
sagarafishing/
├── bot.py              # Entry point utama & handler Telegram Bot
├── keyboards.py        # Builder Inline Keyboard
├── database.py         # SQLite Manager & Schema
├── fishing.py          # Logika RNG dua layer, cooldown, & ekonomi
├── generate_fish.py    # Generator database 300 ikan
├── fish_data.json      # File data 300 ikan (auto-generated)
├── rods.json           # Data 4 kasta pancingan
├── requirements.txt    # Python package requirements
└── README.md           # Panduan penggunaan
```

---

## 🛡️ Lisensi & Lisensi Penggunaan
Dibuat khusus untuk pengujian dan game bot Telegram interaktif.
