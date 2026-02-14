const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    downloadContentFromMessage,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const express = require('express');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const git = require('simple-git')();

const app = express();
const PORT = process.env.PORT || 8000; // Hugging Face සඳහා 8000 නිර්දේශිතයි
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Folder paths
const SESSION_DIR = './sessions';
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

// --- 🛡️ CONFIGURATION ---
const botName = "Z-BOT V1";
const botLogo = "https://ibb.co/pvtzZq0y";

let botSettings = {
    alwaysOnline: true,
    autoStatusSeen: true,
    autoStatusReact: true,
    ownerNumber: "" 
};

// --- ⚙️ GITHUB AUTO SYNC FUNCTION ---
const pushSession = async () => {
    try {
        await git.add('./sessions/*');
        await git.commit('Update Session: ' + new Date().toLocaleString());
        await git.push();
        console.log("✅ Session synced with GitHub!");
    } catch (e) {
        console.log("Git Push Error: " + e.message);
    }
};

async function startBot(phoneNumber, res = null) {
    const sessionId = `session_${phoneNumber}`;
    const sessionPath = `${SESSION_DIR}/${sessionId}`;
    
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        // Hugging Face හිදී git push කිරීමට අකමැති නම් මෙය comment කරන්න
        // await pushSession(); 
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log(`✅ Connected: ${sock.user.id}`);
            botSettings.ownerNumber = sock.user.id.split(':')[0];
            if (botSettings.alwaysOnline) sock.sendPresenceUpdate('available');
        }

        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log("🔄 Reconnecting...");
                startBot(phoneNumber);
            } else {
                console.log("❌ Logged out!");
            }
        }
    });

    // Pairing Code Generator
    if (!sock.authState.creds.registered && phoneNumber && res) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                if (!res.headersSent) {
                    res.send(`
                    <body style="font-family:sans-serif;text-align:center;padding:50px;background:#f0f2f5;">
                        <div style="background:white;padding:30px;border-radius:15px;display:inline-block;box-shadow:0 10px 30px rgba(0,0,0,0.1);">
                            <h2 style="color:#075e54;">${botName} Pairing Code</h2>
                            <p>ඔබේ WhatsApp හි <b>Linked Devices</b> වෙත ගොස් පහත code එක ඇතුළත් කරන්න.</p>
                            <h1 style="font-size:50px;letter-spacing:10px;color:#25D366;margin:20px 0;background:#f9f9f9;padding:10px;border-radius:10px;">${code}</h1>
                            <a href="/" style="text-decoration:none;color:#999;">Back to Home</a>
                        </div>
                    </body>`);
                }
            } catch (err) { 
                console.error(err);
                if (!res.headersSent) res.send("Error generating code. Please try again.");
            }
        }, 3000);
    }

    // --- MESSAGES HANDLER ---
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
        const prefix = ".";

        if (from === 'status@broadcast') {
            if (botSettings.autoStatusSeen) await sock.readMessages([msg.key]);
            if (botSettings.autoStatusReact) {
                await sock.sendMessage(from, { react: { text: '❤️', key: msg.key } }, { statusJidList: [msg.key.participant] });
            }
            return;
        }

        if (!text.startsWith(prefix)) return;
        const command = text.slice(prefix.length).trim().split(' ')[0];
        const args = text.trim().split(/ +/).slice(1);

        if (command === 'ping') {
            await sock.sendMessage(from, { text: "Pong! ⚡" }, { quoted: msg });
        }

        if (command === 'menu') {
            let menuTxt = `*👋 Hello!*\n\n🤖 *${botName} Menu*\n\n`;
            menuTxt += `📥 *DOWNLOADS*\n.song [name]\n\n🛠️ *SYSTEM*\n.ping\n.menu\n\n_© Z-BOT AUTOMATION_`;
            await sock.sendMessage(from, { image: { url: botLogo }, caption: menuTxt }, { quoted: msg });
        }

        if (command === 'song') {
            if (!args[0]) return sock.sendMessage(from, { text: "කරුණාකර ගීතයේ නම සඳහන් කරන්න!" });
            try {
                const search = await yts(args.join(" "));
                const video = search.videos[0];
                await sock.sendMessage(from, { text: `🎧 *Downloading:* ${video.title}...` });
                
                const stream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio' });
                let chunks = [];
                stream.on('data', chunk => chunks.push(chunk));
                stream.on('end', async () => {
                    await sock.sendMessage(from, { 
                        audio: Buffer.concat(chunks), 
                        mimetype: 'audio/mp4',
                        ptt: false 
                    }, { quoted: msg });
                });
            } catch (e) {
                await sock.sendMessage(from, { text: "ගීතය බාගත කිරීමේදී දෝෂයක් ඇතිවිය!" });
            }
        }
    });
}

// Start existing sessions
if (fs.existsSync(SESSION_DIR)) {
    fs.readdirSync(SESSION_DIR).forEach(folder => {
        if (folder.startsWith('session_')) {
            const num = folder.replace('session_', '');
            startBot(num).catch(e => console.log("Session init error:", e));
        }
    });
}

// --- WEB INTERFACE ---
app.get('/', (req, res) => {
    res.send(`
    <body style="font-family:sans-serif;text-align:center;padding:50px;background:#f0f2f5;">
        <div style="background:white;padding:30px;border-radius:15px;display:inline-block;box-shadow:0 10px 30px rgba(0,0,0,0.1);">
            <h2 style="color:#075e54;">🤖 ${botName} Dashboard</h2>
            <p>පහතින් ඔබේ WhatsApp අංකය ඇතුළත් කර Pairing Code එක ලබාගන්න.</p>
            <form action="/getcode" method="POST">
                <input type="text" name="number" placeholder="947xxxxxxxx" required 
                    style="padding:12px;width:280px;border-radius:8px;border:1px solid #ddd;outline:none;font-size:16px;">
                <br><br>
                <button type="submit" 
                    style="background:#25D366;color:white;padding:12px 25px;border:none;border-radius:8px;cursor:pointer;font-weight:bold;font-size:16px;">
                    Get Pairing Code
                </button>
            </form>
            <p style="margin-top:20px;font-size:12px;color:#777;">Enter number with country code (e.g. 94712345678)</p>
        </div>
    </body>`);
});

app.post('/getcode', async (req, res) => {
    let num = req.body.number ? req.body.number.replace(/[^0-9]/g, '') : null;
    if (num) {
        await startBot(num, res).catch(e => res.send("Error starting bot."));
    } else {
        res.send("Invalid Number. <a href='/'>Go back</a>");
    }
});

app.listen(PORT, () => console.log(`${botName} running on port ${PORT}`));

