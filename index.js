const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jmp
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const express = require('express');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');

const app = express();
// Hugging Face සඳහා අනිවාර්යයෙන්ම 7860 භාවිතා කරන්න
const PORT = process.env.PORT || 7860;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SESSION_DIR = './sessions';
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const botName = "Z-BOT V1";

async function startBot(phoneNumber, res = null) {
    const sessionPath = `${SESSION_DIR}/session_${phoneNumber}`;
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"], // Pairing code සඳහා මෙය වැදගත් වේ
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                startBot(phoneNumber);
            }
        } else if (connection === 'open') {
            console.log(`✅ Connected: ${sock.user.id}`);
        }
    });

    // Pairing Code ලබාගැනීමේ කොටස
    if (!sock.authState.creds.registered && phoneNumber) {
        try {
            // තත්පර 3ක් රැඳී සිට කේතය ඉල්ලීම (සර්වර් එක සූදානම් වීමට)
            await new Promise(resolve => setTimeout(resolve, 3000));
            const code = await sock.requestPairingCode(phoneNumber);
            
            if (res && !res.headersSent) {
                res.send(`
                <body style="font-family:sans-serif;text-align:center;padding:50px;background:#f0f2f5;">
                    <div style="background:white;padding:40px;border-radius:20px;display:inline-block;box-shadow:0 10px 30px rgba(0,0,0,0.1);max-width:400px;">
                        <h2 style="color:#075e54;margin-bottom:10px;">${botName} Pairing Code</h2>
                        <p style="color:#666;">පහත කේතය කොපි කර ඔබගේ WhatsApp හි <b>Linked Devices</b> වෙත ගොස් ඇතුළත් කරන්න.</p>
                        <div style="background:#f9f9f9; padding:20px; border-radius:10px; margin:20px 0; border:2px dashed #25D366;">
                            <h1 style="font-size:45px;letter-spacing:8px;color:#25D366;margin:0;font-family:monospace;">${code}</h1>
                        </div>
                        <p style="font-size:13px;color:#999;">මෙම කේතය විනාඩි කිහිපයකින් කල් ඉකුත් වේ.</p>
                        <a href="/" style="color:#075e54;text-decoration:none;font-weight:bold;">← නැවත මුල් පිටුවට</a>
                    </div>
                </body>`);
            }
        } catch (err) {
            console.error("Pairing Code Error:", err);
            if (res && !res.headersSent) res.send("කේතය ලබාගැනීමේදී දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.");
        }
    }

    // Messages Handler
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();

        if (text === '.ping') await sock.sendMessage(from, { text: "Pong! ⚡" });
    });
}

// මුල් පිටුව (Dashboard)
app.get('/', (req, res) => {
    res.send(`
    <body style="font-family:sans-serif;text-align:center;padding:50px;background:#f0f2f5;">
        <div style="background:white;padding:40px;border-radius:20px;display:inline-block;box-shadow:0 10px 30px rgba(0,0,0,0.1);">
            <h2 style="color:#075e54;">🤖 ${botName} Dashboard</h2>
            <p style="color:#666;margin-bottom:25px;">ඔබගේ WhatsApp අංකය රටේ කේතය සමඟ ඇතුළත් කරන්න.</p>
            <form action="/getcode" method="POST">
                <input type="text" name="number" placeholder="947xxxxxxxx" required 
                    style="padding:15px;width:300px;border-radius:10px;border:1px solid #ddd;font-size:16px;outline:none;">
                <br><br>
                <button type="submit" 
                    style="background:#25D366;color:white;padding:15px 30px;border:none;border-radius:10px;cursor:pointer;font-size:16px;font-weight:bold;width:100%;">
                    Get Pairing Code
                </button>
            </form>
            <p style="margin-top:20px;font-size:12px;color:#999;">උදාහරණ: 94712345678</p>
        </div>
    </body>`);
});

app.post('/getcode', async (req, res) => {
    let num = req.body.number ? req.body.number.replace(/[^0-9]/g, '') : null;
    if (num && num.length > 8) {
        await startBot(num, res);
    } else {
        res.send("වලංගු නොවන අංකයකි. <a href='/'>නැවත උත්සාහ කරන්න</a>");
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

