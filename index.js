const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const express = require('express');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');

const app = express();
const PORT = process.env.PORT || 7860;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SESSION_DIR = './sessions';
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const botName = "Z-BOT V1";
const botLogo = "https://ibb.co/pvtzZq0y";

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
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason !== DisconnectReason.loggedOut) startBot(phoneNumber);
        } else if (connection === 'open') {
            console.log(`✅ Connected: ${sock.user.id}`);
        }
    });

    if (!sock.authState.creds.registered && phoneNumber && res) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                if (!res.headersSent) {
                    res.send(`
                    <body style="font-family:sans-serif;text-align:center;padding:50px;background:#f0f2f5;">
                        <div style="background:white;padding:30px;border-radius:15px;display:inline-block;box-shadow:0 10px 30px rgba(0,0,0,0.1);">
                            <h2 style="color:#075e54;">${botName} Pairing Code</h2>
                            <h1 style="font-size:50px;letter-spacing:10px;color:#25D366;margin:20px 0;background:#f9f9f9;padding:10px;">${code}</h1>
                            <p>ඔබේ WhatsApp හි <b>Linked Devices</b> වෙත ගොස් මෙම code එක ඇතුළත් කරන්න.</p>
                            <a href="/">Back</a>
                        </div>
                    </body>`);
                }
            } catch (err) {
                if (!res.headersSent) res.send("Error. Try again.");
            }
        }, 3000);
    }

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();

        if (text === '.ping') await sock.sendMessage(from, { text: "Pong! ⚡" });
    });
}

app.get('/', (req, res) => {
    res.send(`
    <body style="font-family:sans-serif;text-align:center;padding:50px;background:#f0f2f5;">
        <div style="background:white;padding:30px;border-radius:15px;display:inline-block;">
            <h2>🤖 ${botName} Dashboard</h2>
            <form action="/getcode" method="POST">
                <input type="text" name="number" placeholder="947xxxxxxxx" required style="padding:10px;width:250px;"><br><br>
                <button type="submit" style="background:#25D366;color:white;padding:10px 20px;border:none;cursor:pointer;">Get Pairing Code</button>
            </form>
        </div>
    </body>`);
});

app.post('/getcode', async (req, res) => {
    let num = req.body.number ? req.body.number.replace(/[^0-9]/g, '') : null;
    if (num) await startBot(num, res);
    else res.send("Invalid Number.");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

