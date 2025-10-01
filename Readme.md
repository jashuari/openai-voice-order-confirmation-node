# Voice Order Confirmer for E-Commerce (Shopaz/Gjirafa style)

## A small **Node.js / Fastify** service that uses **Twilio Media Streams** + **OpenAI Realtime API** to confirm e-commerce orders over the phone in Albanian.  
## The bot calls the customer, greets them with a company name and order ID, listens for their response, and politely hangs up.
---

## Features

- 📞 Inbound Twilio call → OpenAI Realtime stream  
- 🎙️ Real-time Albanian TTS + ASR loop  
- 🏷️ Dynamic order/company ID in the greeting  
- ✅ Detects user’s voice → thanks them → hangs up cleanly  
- ⚡ Built with Fastify + WS, no heavy frameworks  

---

## Requirements

- Node.js **20+**
- A Twilio account with:
  - A Twilio phone number (capable of Voice)
  - Programmable Voice → Media Streams enabled
- An OpenAI API key (Realtime access)
- [ngrok](https://ngrok.com) (or any public HTTPS tunnel) for local testing  

---

## Setup

### 1. Clone and install
```bash
git clone h
cd 
pnpm install   # or npm / yarn
