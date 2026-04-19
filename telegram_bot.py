import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import requests
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command

# --- CONFIGURATION (use env vars in production) ---
API_TOKEN = '8750333596:AAHadQLpAYal70xQi8H7oyh1yi5tUcgzEZs'
ADMIN_ID = 2114606490
WEBSITE_URL = "https://rrbtwittercampaign.onrender.com"
BOT_SECRET = "Sidd_Secret_99"

bot = Bot(token=API_TOKEN)
dp = Dispatcher()

all_suggestions = []
cached_admins = [ADMIN_ID]


def is_admin(message: types.Message):
    return message.from_user.id in cached_admins


def send_to_web(action, payload=None):
    global cached_admins
    try:
        r = requests.post(f"{WEBSITE_URL}/api/admin/bot-action", json={
            "secret": BOT_SECRET,
            "action": action,
            "payload": payload
        })
        data = r.json()
        if "admins" in data:
            cached_admins = list(set([ADMIN_ID] + data["admins"]))
        return data
    except Exception as e:
        print("Error sending to web:", e)
        return None


def format_live_stats(data):
    stats = data.get('stats') or {}
    reg = data.get('regCount', '—')
    return (
        "📊 *Live campaign (text)*\n\n"
        f"• Tweets: `{stats.get('tweets', 0)}`\n"
        f"• Retweets: `{stats.get('retweets', 0)}`\n"
        f"• Quotes: `{stats.get('quotes', 0)}`\n"
        f"• Replies: `{stats.get('replies', 0)}`\n"
        f"• Registrations: `{reg}`\n\n"
        f"Website: {WEBSITE_URL}"
    )


@dp.message(Command("start", "help"))
async def send_help(message: types.Message):
    if not is_admin(message):
        return
    help_text = (
        "🤖 *TELEGRAM ADMIN COMMAND CENTER*\n\n"
        "📢 *Visual Alerts (Website Overlays)*\n"
        "`/broadcast [msg]` - Blue banner\n"
        "`/boost [msg]` - Red pulse\n"
        "`/prealert [msg]` - Purple floating\n"
        "`/clear` - Clear alerts\n\n"
        "📊 *Campaign Data*\n"
        "`/card` - Live stats (text)\n"
        "`/precampaignstats` - Registration count (text)\n"
        "`/stats` - Short stats\n\n"
        "⚙️ *System*\n"
        "`/phase` - Toggle pre-launch\n"
        "`/killswitch` - Kill switch\n"
        "`/settimer [sec]` - Action cooldown\n"
        "`/addadmin [id]` / `/removeadmin [id]`\n"
    )
    await message.answer(help_text, parse_mode="Markdown")


@dp.message(Command("card"))
async def send_stats_card(message: types.Message):
    if not is_admin(message):
        return
    try:
        data = requests.get(f"{WEBSITE_URL}/api/live-data", timeout=15).json()
        await message.answer(format_live_stats(data), parse_mode="Markdown")
    except Exception as e:
        await message.reply(f"Error fetching stats: {e}")


@dp.message(Command("precampaignstats"))
async def get_pre_stats(message: types.Message):
    if not is_admin(message):
        return
    try:
        data = requests.get(f"{WEBSITE_URL}/api/live-data", timeout=15).json()
        reg = data.get('regCount', 'N/A')
        await message.answer(
            f"📝 *Pre-campaign*\n\nRegistered: `{reg}`\n\n{WEBSITE_URL}",
            parse_mode="Markdown"
        )
    except Exception as e:
        await message.reply(f"Failed: {e}")


@dp.message(Command("boost"))
async def do_boost(message: types.Message):
    if not is_admin(message):
        return
    text = message.text.split(maxsplit=1)[1] if len(message.text.split()) > 1 else "Speed badhao dosto! 🔥 #Declare_RRBNTPC2024_Result"
    send_to_web("boost", text)
    await message.reply("🔥 NEON BOOST sent to website.")


@dp.message(Command("broadcast"))
async def do_broadcast(message: types.Message):
    if not is_admin(message):
        return
    text = message.text.split(maxsplit=1)[1] if len(message.text.split()) > 1 else "📢 Attention: update!"
    send_to_web("broadcast", text)
    await message.reply("📢 Broadcast sent.")


@dp.message(Command("prealert"))
async def do_prealert(message: types.Message):
    if not is_admin(message):
        return
    text = message.text.split(maxsplit=1)[1] if len(message.text.split()) > 1 else "Pre-campaign alert."
    send_to_web("pre-campaign", text)
    await message.reply("✨ Pre-campaign alert sent.")


@dp.message(Command("clear"))
async def do_clear(message: types.Message):
    if not is_admin(message):
        return
    send_to_web("clear", "")
    await message.reply("✅ Alerts cleared on website.")


@dp.message(Command("stats"))
async def get_stats(message: types.Message):
    if not is_admin(message):
        return
    try:
        data = requests.get(f"{WEBSITE_URL}/api/live-data", timeout=15).json()
        stats = data['stats']
        msg = (
            f"📊 Tweets `{stats['tweets']}` · RT `{stats['retweets']}` · "
            f"Quotes `{stats.get('quotes', 0)}` · Replies `{stats['replies']}`"
        )
        await message.answer(msg, parse_mode="Markdown")
    except Exception:
        await message.reply("Failed to fetch live stats.")


@dp.message(Command("phase"))
async def do_phase(message: types.Message):
    if not is_admin(message):
        return
    send_to_web("phase", "")
    await message.reply("🔄 Pre-launch toggled on website.")


@dp.message(Command("killswitch"))
async def do_killswitch(message: types.Message):
    if not is_admin(message):
        return
    send_to_web("killswitch", "")
    await message.reply("🛑 Kill switch toggled.")


@dp.message(Command("settimer"))
async def do_settimer(message: types.Message):
    if not is_admin(message):
        return
    try:
        sec = message.text.split()[1]
        send_to_web("set-timer", sec)
        await message.reply(f"⏳ Timer set to {sec}s.")
    except Exception:
        await message.reply("Use /settimer 5")


@dp.message(Command("addadmin"))
async def do_addadmin(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return
    try:
        new_id = message.text.split()[1]
        send_to_web("add-admin", new_id)
        await message.reply(f"✅ Admin {new_id} added.")
    except Exception:
        await message.reply("Use /addadmin <id>")


@dp.message(Command("removeadmin"))
async def do_removeadmin(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return
    try:
        rm_id = message.text.split()[1]
        send_to_web("remove-admin", rm_id)
        await message.reply(f"❌ Admin {rm_id} removed.")
    except Exception:
        await message.reply("Use /removeadmin <id>")


@dp.message(F.text.contains("@Siddharthax007"))
async def handle_mentions(message: types.Message):
    if message.from_user.id == ADMIN_ID:
        return
    suggestion_text = message.text
    user_info = f"{message.from_user.full_name} (@{message.from_user.username})"
    all_suggestions.append({"user": user_info, "text": suggestion_text})
    await message.reply("✅ Noted on the behalf of Siddhartha.")


@dp.message(Command("show_suggestions"))
async def list_suggestions(message: types.Message):
    if not is_admin(message):
        return
    if not all_suggestions:
        await message.answer("📁 No suggestions yet.")
        return
    msg = "📋 *Suggestions:*\n\n"
    for i, s in enumerate(all_suggestions, 1):
        msg += f"{i}. *{s['user']}*:\n   _{s['text']}_\n\n"
    await message.answer(msg, parse_mode="Markdown")


@dp.message(F.chat.type == "private")
async def handle_private_messages(message: types.Message):
    if message.from_user.id == ADMIN_ID:
        if message.reply_to_message and message.reply_to_message.forward_origin:
            if hasattr(message.reply_to_message.forward_origin, 'sender_user') and message.reply_to_message.forward_origin.sender_user:
                target_id = message.reply_to_message.forward_origin.sender_user.id
                try:
                    await message.copy_to(target_id)
                    await message.reply("✅ Sent.")
                except Exception as e:
                    await message.reply(f"❌ Failed: {e}")
            else:
                await message.reply("❌ Cannot reply (privacy).")
        return
    try:
        await message.forward(ADMIN_ID)
        await message.reply("✅ Forwarded to admin.")
    except Exception as e:
        print(f"Error forwarding: {e}")


async def main():
    print("Bot is running (no Pillow — text-only /card)...")
    send_to_web("get-admins", "")
    await dp.start_polling(bot)


if __name__ == '__main__':
    asyncio.run(main())
