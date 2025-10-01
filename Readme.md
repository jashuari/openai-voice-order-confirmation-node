Voice Order Confirmer for E-Commerce (Shopaz/Gjirafa style)

A small Node.js/Fastify service that uses Twilio Media Streams + OpenAI Realtime API to confirm e-commerce orders over the phone in Albanian.
The bot calls the customer, greets them with a company name and order ID, listens for their response, and politely hangs up.

Why

Manual phone confirmations are slow and costly. This demo shows how you can automate it with voice AI, while still keeping it natural and local-language friendly.

Features

📞 Inbound Twilio call → OpenAI Realtime stream

🎙️ Real-time Albanian TTS + ASR loop

🏷️ Dynamic order/company ID in the greeting

✅ Detects user’s voice → thanks them → hangs up cleanly

⚡ Built with Fastify + WS, no heavy frameworks

Requirements

Node.js 20+

A Twilio account with:

A Twilio phone number (capable of Voice)

Programmable Voice → Media Streams enabled

An OpenAI API key (Realtime access)

ngrok (or any public HTTPS tunnel) for local testing

Setup
1. Clone and install
git clone https://github.com/yourname/voice-order-confirmer.git
cd voice-order-confirmer
pnpm install   # or npm / yarn

2. Environment variables

Copy .env.example → .env and fill it in:

OPENAI_API_KEY=sk-xxxx
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
PORT=5050

3. Twilio configuration

Buy/assign a Twilio number.

In Twilio Console → Voice → Manage Numbers → your number:

Voice webhook URL →

https://<your-host-or-ngrok>/incoming-call


Method: HTTP POST

Enable Media Streams → point to:

wss://<your-host-or-ngrok>/media-stream


Save and test with a call to your Twilio number.

4. Run locally
pnpm start


Expose port for Twilio:

ngrok http 5050

Local Testing without Twilio (mic-client)

You can test locally without a Twilio number using mic-client.cjs.
It simulates Twilio Media Streams by sending your mic audio as μ-law frames and playing bot responses back to your speakers.

What it does

🎤 Captures mic at 8 kHz PCM16 mono

🔄 Converts to μ-law, splits into 20ms frames, sends as media events

🔊 Plays bot responses on your speakers (8 kHz)

📢 Sends Twilio-like start + stop events

✅ Includes a strict 20ms pacing fix → if your mic drifts from 8kHz, it pads with silence frames instead of glitching

Run it
WS_URL=ws://localhost:5050/media-stream \
MIC_DEVICE=default \
PLAYBACK_GAIN=1.6 \
node mic-client.cjs


WS_URL → your server WebSocket (/media-stream)

MIC_DEVICE → optional mic device (default, hw:0,0, etc.)

PLAYBACK_GAIN → loudness multiplier (1.0–3.0)

Troubleshooting

Chipmunk / fast audio → your mic isn’t true 8kHz, use SoX or set OS input to 8kHz

Speaker underruns → lower PLAYBACK_GAIN

No mic input → check devices

Linux: arecord -l → MIC_DEVICE="hw:0,0"

macOS: MIC_DEVICE=default

How it works

Twilio (or mic-client) sends audio frames to /media-stream.

Server bridges to OpenAI Realtime API.

Bot generates Albanian voice reply.

Frames are sent back to caller (or mic-client speaker).

Once user confirms, bot thanks them and hangs up.

Roadmap

 Add DTMF support (1 to confirm, 2 to cancel)

 CRM integration for auto-updating order status

 Retry logic + voicemail detection

 Multi-language support