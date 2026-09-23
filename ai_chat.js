const crypto = require('node:crypto');

const API = "https://app.unlimitedai.chat/api/chat";

const ua =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";

function parseSetCookie(headers) {
    const result = {};
    let setCookie = null;
    if (headers && typeof headers.getSetCookie === "function") setCookie = headers.getSetCookie();
    else if (headers && headers.get) setCookie = [headers.get("set-cookie")];
    if (!setCookie) return result;
    setCookie.forEach((item) => {
        if (!item) return;
        const first = item.split(";")[0];
        const index = first.indexOf("=");
        if (index !== -1) result[first.slice(0, index).trim()] = first.slice(index + 1).trim();
    });
    return result;
}

function buildCookie(deviceId, chatId, cookies = {}) {
    return Object.entries({ NEXT_LOCALE: "id", u_device_id: deviceId, home_chat_id: chatId, ...cookies })
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
}

const CHARACTERS = {
    "ngawi-ai": {
        name: "Ngawi AI",
        prompt: `Kamu adalah Ngawi AI, asisten cerdas dari bot WhatsApp "Sagara Fishing" yang berpusat di Ngawi, Jawa Timur.
Kamu ramah, santai, dan hangat khas orang Ngawi. Sesekali pakai logat Jawa halus yang ringan (contoh: "nggih", "monggo", "niku", "endo", "ojo") tapi jangan berlebihan sampai menyulitkan.
Jawab selalu dalam bahasa Indonesia yang jelas, santai, dan terstruktur. Kalau ditanya soal teknis, programming, atau tugas lain, jawab dengan ringkas, beri contoh bila perlu.
Jangan menyebut bahwa kamu dibuat/ditenagai oleh model AI pihak ketiga mana pun. Cukup kenalkan dirimu sebagai Ngawi AI dari Sagara Fishing.
Gunakan emoji secukupnya agar hangat, tapi jawab harus tetap padat dan tidak bertele-tele.`,
    },
};

async function NgawiAI(question, character = "ngawi-ai") {
    const chatId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const char = CHARACTERS[character] || CHARACTERS["ngawi-ai"];

    const systemPrompt = `${char.prompt}\n\nPertanyaan user: ${question}`;
    const createdAt = new Date().toISOString();

    const messages = [
        { id: crypto.randomUUID(), role: "user", content: systemPrompt, parts: [{ type: "text", text: systemPrompt }], createdAt },
        { id: crypto.randomUUID(), role: "assistant", content: "", parts: [{ type: "text", text: "" }], createdAt },
    ];

    const body = {
        chatId,
        messages,
        selectedChatModel: "chat-model-reasoning",
        selectedCharacter: null,
        selectedStory: null,
        deviceId,
        locale: "id",
    };

    const headers = {
        "sec-ch-ua-platform": `"Android"`,
        "user-agent": ua,
        "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
        "content-type": "application/json",
        "sec-ch-ua-mobile": "?1",
        "x-next-intl-locale": "id",
        accept: "*/*",
        origin: "https://app.unlimitedai.chat",
        referer: "https://app.unlimitedai.chat/id",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        cookie: buildCookie(deviceId, chatId),
        priority: "u=1, i",
    };

    const response = await fetch(API, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text();
        return { status: false, code: response.status, error: text };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let answer = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            try {
                const json = JSON.parse(line);
                if (json.type === "delta" && typeof json.delta === "string") answer += json.delta;
            } catch {}
        }
    }

    return { status: true, code: response.status, character: char.name, model: "chat-model-reasoning", answer };
}

module.exports = { NgawiAI, CHARACTERS };