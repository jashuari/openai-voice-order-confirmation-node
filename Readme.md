# OpenAI Voice Order Confirmation (Node.js)

A **Node.js + Fastify service** that integrates **Twilio Media Streams** with **OpenAI Realtime API** to confirm e-commerce orders over the phone in **Albanian**.

✅ The bot calls the customer, greets them with company name + order ID, listens for confirmation, then politely hangs up.  
⚡️ This is designed as a **demo / prototype** for e-commerce in Kosovo/Albania (Shopaz, Gjirafa, IG shops, etc.) where manual confirmation is still common.

---

## Why

- 🕑 **Manual confirmations are slow and costly.**  
- 🤖 This bot shows how AI voice can automate it in a **natural, local-language friendly** way.  
- 🌍 Focused on **Albanian**, but extendable to multi-language scenarios.  

---

## Features

- 📞 Inbound **Twilio call** → OpenAI Realtime stream  
- 🎙️ Real-time **TTS + ASR loop** (Albanian speech recognition + voice synthesis)  
- 🏷️ Dynamic **company name + order ID** in the greeting  
- ✅ Detects confirmation in user’s voice → thanks them → hangs up cleanly  
- 🔌 Lightweight stack: **Fastify + WebSockets**, no heavy frameworks  
- 🧪 Includes **mic-client** for local testing (no Twilio required)  

---

## Requirements

- Node.js 20+
- Twilio account with:
- Voice-capable phone number
- Media Streams enabled
- OpenAI API key (Realtime access)
- ngrok (or another HTTPS tunnel for local dev)

How it Works (Flow)
-------------------

1.  Twilio (or the mic-client) connects to the /media-stream WebSocket and sends raw audio frames.
    
2.  The server forwards these audio frames to the **OpenAI Realtime API** via another WebSocket.
    
3.  OpenAI performs **speech-to-text**, generates a response, and synthesizes an **Albanian voice reply**.
    
4.  The server receives the voice audio and streams it back to Twilio (or your speakers).
    
5.  When the bot detects user confirmation, it thanks them, sends a **hangup** command, and closes the connection.

Tech Stack
----------

*   **Fastify** → Web server and WebSocket handling
    
*   **Twilio Programmable Voice** → Media Streams for real-time audio
    
*   **OpenAI Realtime API** → ASR and TTS in Albanian
    
*   **Node.js 20+**
    
*   Optional: **ngrok** for tunneling, **mic-client** for local tests

Disclaimer
----------

⚠️ This is an **experimental prototype**.It is **not production-ready** — intended for demos, research, and proof-of-concepts only. You will need an **OpenAI API key** with Realtime access and a configured **Twilio account** for live testing.

## Architecture

```text
[Customer Call]
      |
      v
[Twilio Media Streams] <--- (ngrok/HTTPS tunnel)
      |
      v
[Fastify Server] --- WebSocket ---> [OpenAI Realtime API]
      |
      v
[Voice Reply in Albanian]
      |
      v
[Customer confirms → Bot hangs up]


