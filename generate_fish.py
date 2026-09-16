#!/usr/bin/env python3
"""
Generator 300 jenis ikan untuk Fishing Bot
Distribusi: T1=80, T2=70, T3=60, T4=45, T5=25, T6=15, T7=5
"""

import json
import random

# Daftar nama ikan Indonesia (nyata + mitos)
FISH_NAMES = {
    1: [  # Tier 1 - Common (80 ikan)
        "Ikan Mas", "Lele", "Nila", "Mujair", "Sepat", "Gabus", "Betok",
        "Tawes", "Wader", "Sili", "Patin Kecil", "Bandeng Kecil", "Gurame Kecil",
        "Tombro", "Keprek", "Kutuk", "Betutu", "Tembakang", "Palung", "Jelawat",
        "Bader", "Nilem", "Tambakan", "Senggaringan", "Lunjar", "Palau", "Lalawak",
        "Seluang", "Sapat", "Benteur", "Genggehek", "Tagih", "Beong", "Wels",
        "Belida Kecil", "Julung-julung", "Belanak Kecil", "Teri", "Tembang", "Lemuru",
        "Sarden", "Ikan Asin", "Petek", "Kuniran", "Selar", "Bulu Ayam", "Pepetek",
        "Alu-alu Kecil", "Bilis", "Japuh", "Layur Kecil", "Beloso", "Senangin",
        "Gulama Kecil", "Peperek", "Kurisi", "Biji Nangka", "Tigawaja", "Ekor Kuning",
        "Baronang Kecil", "Kuwe Kecil", "Kerapu Lumpur", "Kakap Putih Kecil", "Sembilang",
        "Duri", "Lais", "Baung", "Tagel", "Rita", "Jambal", "Senggal", "Lawang",
        "Selais", "Tilan", "Tapah Kecil", "Belut", "Sidat Kecil", "Lele Lokal",
        "Ikan Sapu-sapu", "Platy", "Molly", "Swordtail", "Guppy Liar"
    ],
    2: [  # Tier 2 - Uncommon (70 ikan)
        "Gurame", "Patin", "Bandeng", "Bawal Air Tawar", "Nila Merah", "Mas Koki",
        "Koi", "Arwana Lokal", "Gabus Besar", "Belida", "Tapah", "Jelawat Besar",
        "Tengadak", "Semah", "Hampala", "Biawan", "Kelabau", "Tengalan", "Sebarau",
        "Baung Besar", "Tagih Besar", "Lais Besar", "Kakap Putih", "Kerapu", "Baronang",
        "Kuwe", "Bawal Hitam", "Bawal Putih", "Buntal", "Kakap Merah Kecil", "Kakap Batu",
        "Jenaha", "Kurau", "Belanak", "Bandeng Laut", "Lemadang Kecil", "Tongkol",
        "Cakalang Kecil", "Tuna Sirip Kuning Kecil", "Layang", "Selar Kuning", "Kembung",
        "Barakuda Kecil", "Tenggiri Kecil", "Layur", "Golok-golok", "Ekor Merah", "Kakap Mata Kucing",
        "Kuwe Gerong", "Kuwe Putih", "Bubara", "Kerapu Sunu", "Kerapu Macan Kecil", "Kerapu Bebek",
        "Kerapu Tikus", "Lencam", "Ekor Kuning Besar", "Beronang", "Tanda-tanda", "Napoleon Kecil",
        "Rombong", "Kaci-kaci", "Senangin Besar", "Gulama", "Pari Kecil", "Pari Mondol",
        "Hiu Bambu", "Hiu Karpet", "Cucut", "Todak Kecil"
    ],
    3: [  # Tier 3 - Rare (60 ikan)
        "Arwana Super Red", "Arwana Golden", "Belida Raksasa", "Tapah Raksasa", "Jelawat Raksasa",
        "Kakap Merah", "Kerapu Macan", "Kerapu Sunu Besar", "Napoleon", "Kuwe Besar", "Bawal Bintang",
        "Tenggiri", "Tuna Sirip Kuning", "Cakalang", "Lemadang", "Marlin Kecil", "Sailfish Kecil",
        "Barakuda", "Kakap Merah Besar", "Kerapu Batik", "Kerapu Lumpur Besar", "Barramundi",
        "Pari Elang", "Pari Kupu-kupu", "Hiu Macan", "Hiu Karang", "Hiu Ujung Hitam", "Hiu Ujung Putih",
        "Belut Laut", "Belut Moray", "Baronang Raksasa", "Buntal Besar", "Ikan Keling", "Tuna Albacore",
        "Wahoo", "Mahi-mahi", "Yellowtail", "Amberjack", "Giant Trevally", "Kerapu Goliath Kecil",
        "Hiu Martil Kecil", "Hiu Biru", "Hiu Sutra", "Pari Manta Kecil", "Pari Besar", "Pari Listrik",
        "Belut Listrik", "Arapaima Kecil", "Ikan Terbang Raksasa", "Todak", "Pedang-pedang",
        "Moonfish", "Sunfish Kecil", "Tarpon", "Sturgeon Kecil", "Gar", "Bowfin", "Alligator Gar Kecil",
        "Arapaima", "Pacu Raksasa"
    ],
    4: [  # Tier 4 - Epic (45 ikan)
        "Tuna Sirip Biru Kecil", "Marlin Biru Kecil", "Marlin Hitam Kecil", "Sailfish", "Hiu Putih Kecil",
        "Hiu Martil", "Hiu Banteng", "Hiu Harimau Kecil", "Pari Manta", "Pari Raksasa", "Arapaima Raksasa",
        "Beluga Sturgeon Kecil", "Alligator Gar", "Sunfish", "Tuna Sirip Biru", "Barracuda Raksasa",
        "Kerapu Goliath", "Napoleon Raksasa", "Giant Grouper", "Hiu Paus Kecil", "Hiu Greenland Kecil",
        "Wolffish", "Halibut Raksasa", "Swordfish", "Opah", "Yellowfin Tuna Raksasa", "Bigeye Tuna",
        "Hiu Makarel", "Hiu Pelagis", "Marlin Putih", "Spearfish", "Dorado Raksasa", "Cobia Raksasa",
        "Tarpon Raksasa", "Beluga", "Kaluga", "Paddlefish", "Arapaima Merah", "Alligator Gar Raksasa",
        "Belut Listrik Raksasa", "Pirarucu", "Ikan Garuda", "Ikan Naga Air Tawar", "Ikan Dewa Sungai",
        "Ikan Raja Danau", "Ikan Penguasa Rawa"
    ],
    5: [  # Tier 5 - Legendary (25 ikan)
        "Tuna Sirip Biru Raksasa", "Marlin Biru", "Marlin Hitam", "Hiu Putih Besar", "Hiu Harimau",
        "Hiu Paus", "Pari Manta Raksasa", "Beluga Sturgeon", "Sunfish Raksasa", "Hiu Greenland",
        "Hiu Megamouth", "Oarfish", "Coelacanth", "Ikan Purba", "Marlin Raksasa", "Swordfish Raksasa",
        "Ikan Naga Laut", "Ikan Raja Samudra", "Ikan Dewa Pasifik", "Ikan Penguasa Atlantik",
        "Belut Laut Raksasa", "Ular Laut Raksasa", "Ikan Garuda Emas", "Ikan Phoenix", "Naga Laut Biru"
    ],
    6: [  # Tier 6 - Mythic (15 ikan)
        "Leviathan Muda", "Kraken Muda", "Naga Laut Kuno", "Ular Raksasa Midgard", "Basilisk Laut",
        "Hydra Laut", "Scylla", "Charybdis", "Makhluk Abyssal", "Penguasa Palung", "Ikan Dewa Kuno",
        "Naga Samudra Hitam", "Ular Naga Laut", "Ikan Titan", "Dewa Laut Poseidon"
    ],
    7: [  # Tier 7 - Divine (5 ikan)
        "Leviathan", "Kraken Raksasa", "Jormungandr", "Tiamat Naga Laut", "Dewa Laut Primordial"
    ]
}

EMOJIS = {
    1: ["🐟", "🐠", "🎣", "🐡"],
    2: ["🐠", "🐟", "🎣", "🦈"],
    3: ["🦈", "🐠", "🐟", "🦑"],
    4: ["🦈", "🐋", "🦑", "🐙"],
    5: ["🐋", "🦈", "🐙", "🦑"],
    6: ["🐉", "🐲", "🦑", "🐙"],
    7: ["🐉", "🐲", "⚡", "🔱"]
}

DESCRIPTIONS = {
    1: [
        "Ikan biasa yang sering ditemukan di sungai dan danau",
        "Ikan air tawar yang mudah ditangkap",
        "Ikan kecil yang cocok untuk pemula",
        "Ikan umum di perairan Indonesia",
        "Ikan air tawar yang lezat",
        "Ikan sederhana namun bernilai",
        "Ikan yang sering dijumpai nelayan lokal"
    ],
    2: [
        "Ikan yang cukup berharga di pasaran",
        "Ikan yang membutuhkan skill untuk menangkap",
        "Ikan berkualitas dengan daging lezat",
        "Ikan yang dicari para pemancing",
        "Ikan dengan nilai ekonomi lumayan",
        "Ikan yang memiliki ukuran sedang",
        "Ikan yang populer di kalangan pemancing"
    ],
    3: [
        "Ikan langka yang jarang tertangkap",
        "Ikan berharga dengan ukuran besar",
        "Ikan yang memerlukan keberuntungan tinggi",
        "Ikan eksotis yang dicari kolektor",
        "Ikan langka dengan harga fantastis",
        "Ikan yang menjadi impian pemancing",
        "Ikan yang sangat sulit ditemukan"
    ],
    4: [
        "Ikan epik dengan ukuran sangat besar",
        "Ikan legendaris yang kuat dan berharga",
        "Ikan yang hanya bisa ditangkap pemancing ahli",
        "Ikan raksasa yang sangat langka",
        "Ikan spektakuler yang sangat mahal",
        "Ikan yang menjadi legenda di kalangan nelayan",
        "Ikan epik yang sangat jarang muncul"
    ],
    5: [
        "Ikan legendaris yang sangat langka",
        "Makhluk laut raksasa yang menakjubkan",
        "Ikan mitos yang jarang terlihat manusia",
        "Penguasa laut yang sangat langka",
        "Ikan purba dengan ukuran monumental",
        "Makhluk legendaris dari kedalaman laut",
        "Ikan yang menjadi mitos di kalangan pelaut"
    ],
    6: [
        "Makhluk mitos dari kedalaman laut gelap",
        "Penguasa abyssal yang sangat menakutkan",
        "Naga laut dari legenda kuno",
        "Makhluk purba yang hampir punah",
        "Dewa laut yang sangat langka",
        "Monster legendaris yang sangat kuat"
    ],
    7: [
        "Dewa laut yang menguasai samudra",
        "Makhluk divine yang hanya muncul sekali seumur hidup",
        "Penguasa tertinggi lautan",
        "Naga primordial dari awal zaman",
        "Entitas divine yang legendaris"
    ]
}

def generate_fish_database():
    """Generate 300 ikan dengan distribusi tier yang sesuai"""
    all_fish = []
    fish_id = 1
    
    # Tier configs: (tier, count, weight_min, weight_max, price_per_kg, base_chance_modifier)
    tier_configs = [
        (1, 80, 0.1, 5, 10, 100),       # Common
        (2, 70, 1, 20, 25, 50),         # Uncommon
        (3, 60, 5, 100, 75, 20),        # Rare
        (4, 45, 20, 500, 200, 8),       # Epic
        (5, 25, 100, 2000, 500, 3),     # Legendary
        (6, 15, 500, 8000, 1500, 1),    # Mythic
        (7, 5, 2000, 50000, 5000, 0.2)  # Divine
    ]
    
    tier_names = {
        1: "Biasa",
        2: "Umum",
        3: "Langka",
        4: "Epik",
        5: "Legendaris",
        6: "Mitos",
        7: "Dewa"
    }
    
    for tier, count, weight_min, weight_max, price_per_kg, base_chance in tier_configs:
        names = FISH_NAMES[tier]
        emojis = EMOJIS[tier]
        descriptions = DESCRIPTIONS[tier]
        
        for i in range(count):
            fish_name = names[i % len(names)]
            if i >= len(names):
                fish_name = f"{fish_name} {['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Prima', 'Ultima'][i // len(names)]}"
            
            fish = {
                "id": f"fish_{fish_id:03d}",
                "name": fish_name,
                "tier": tier,
                "tier_name": tier_names[tier],
                "weight_min": weight_min,
                "weight_max": weight_max,
                "price_per_kg": price_per_kg,
                "emoji": random.choice(emojis),
                "description": random.choice(descriptions),
                "base_chance": base_chance
            }
            
            all_fish.append(fish)
            fish_id += 1
    
    return all_fish

def main():
    print("🐟 Generating 300 jenis ikan...")
    fish_data = generate_fish_database()
    
    # Save to JSON
    with open('fish_data.json', 'w', encoding='utf-8') as f:
        json.dump(fish_data, f, ensure_ascii=False, indent=2)
    
    print(f"✅ Generated {len(fish_data)} ikan!")
    
    # Print summary
    tier_counts = {}
    for fish in fish_data:
        tier = fish['tier']
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
    
    print("\n📊 Distribusi Tier:")
    for tier in sorted(tier_counts.keys()):
        print(f"   Tier {tier}: {tier_counts[tier]} ikan")

if __name__ == "__main__":
    main()
