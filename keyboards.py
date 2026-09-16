from telegram import InlineKeyboardButton, InlineKeyboardMarkup

def get_main_menu_keyboard(user):
    keyboard = [
        [InlineKeyboardButton("🎣 MANCING", callback_data="fish"), InlineKeyboardButton("🎒 INVENTORY", callback_data="inv_1")],
        [InlineKeyboardButton("🏪 TOKO", callback_data="shop"), InlineKeyboardButton("👤 PROFIL", callback_data="profile")],
        [InlineKeyboardButton("🏆 LEADERBOARD", callback_data="lb"), InlineKeyboardButton("🎁 DAILY", callback_data="daily")]
    ]
    return InlineKeyboardMarkup(keyboard)

def get_fishing_result_keyboard(can_fish=True, remaining_cooldown=0):
    if can_fish:
        keyboard = [
            [InlineKeyboardButton("🎣 MANCING LAGI", callback_data="fish"), InlineKeyboardButton("🏠 MENU", callback_data="menu")]
        ]
    else:
        keyboard = [
            [InlineKeyboardButton(f"⏳ Tunggu {remaining_cooldown:.1f}s...", callback_data="cooldown"), InlineKeyboardButton("🏠 MENU", callback_data="menu")]
        ]
    return InlineKeyboardMarkup(keyboard)

def get_inventory_keyboard(items, page, total_pages):
    keyboard = []
    for item in items:
        status = "❌" if item['sold'] else "✅"
        keyboard.append([InlineKeyboardButton(f"{status} {item['name']} ({item['weight']}kg)", callback_data=f"inv_detail:{item['id']}")])
    
    nav = []
    if page > 1: nav.append(InlineKeyboardButton("⬅️ Prev", callback_data=f"inv_{page-1}"))
    nav.append(InlineKeyboardButton(f"{page}/{total_pages}", callback_data="noop"))
    if page < total_pages: nav.append(InlineKeyboardButton("Next ➡️", callback_data=f"inv_{page+1}"))
    
    keyboard.append(nav)
    keyboard.append([InlineKeyboardButton("💰 JUAL SEMUA TIER 1", callback_data="sell_tier:1")])
    keyboard.append([InlineKeyboardButton("💰 JUAL SEMUA YANG DICENTANG", callback_data="sell_selected")])
    keyboard.append([InlineKeyboardButton("🏠 MENU", callback_data="menu")])
    return InlineKeyboardMarkup(keyboard)

def get_inventory_selected_keyboard(items, page, total_pages, selected_ids):
    """Keyboard untuk inventory dengan tombol centang dinamis"""
    keyboard = []
    for item in items:
        status = "❌" if item['sold'] else ("✅" if item['id'] in selected_ids else "⬜")
        keyboard.append([InlineKeyboardButton(f"{status} {item['name']} ({item['weight']}kg)", callback_data=f"inv_toggle:{item['id']}")])
    
    nav = []
    if page > 1: nav.append(InlineKeyboardButton("⬅️ Prev", callback_data=f"inv_pg:{page-1}"))
    nav.append(InlineKeyboardButton(f"{page}/{total_pages}", callback_data="noop"))
    if page < total_pages: nav.append(InlineKeyboardButton("Next ➡️", callback_data=f"inv_pg:{page+1}"))
    
    keyboard.append(nav)
    keyboard.append([InlineKeyboardButton("💰 JUAL YANG DICENTANG", callback_data="sell_selected")])
    keyboard.append([InlineKeyboardButton("🏠 MENU", callback_data="menu")])
    return InlineKeyboardMarkup(keyboard)

def get_sell_selected_keyboard(items, selected_ids):
    """Keyboard konfirmasi jual item yang dicentang"""
    selected_items = [i for i in items if i['id'] in selected_ids and not i['sold']]
    total_price = sum(int(i['weight'] * i['price_per_kg']) for i in selected_items)
    
    keyboard = [
        [InlineKeyboardButton(f"💰 JUAL ({len(selected_items)} ikan | {total_price:,} koin)", callback_data="sell_confirm")],
        [InlineKeyboardButton("❌ BATAL", callback_data="menu")]
    ]
    return InlineKeyboardMarkup(keyboard)

def get_shop_keyboard():
    keyboard = [
        [InlineKeyboardButton("🎣 Bambu", callback_data="buy:1"), InlineKeyboardButton("🎣 Kayu", callback_data="buy:2")],
        [InlineKeyboardButton("🎣 Fiber", callback_data="buy:3"), InlineKeyboardButton("🎣 Abyss", callback_data="buy:4")],
        [InlineKeyboardButton("🏠 MENU", callback_data="menu")]
    ]
    return InlineKeyboardMarkup(keyboard)

def get_profile_keyboard():
    keyboard = [
        [InlineKeyboardButton("🍀 UPGRADE LUCK", callback_data="luck_up")],
        [InlineKeyboardButton("🏠 MENU", callback_data="menu")]
    ]
    return InlineKeyboardMarkup(keyboard)

def get_back_menu_keyboard():
    return InlineKeyboardMarkup([[InlineKeyboardButton("🏠 MENU", callback_data="menu")]])
