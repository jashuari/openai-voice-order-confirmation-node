// mic-client.cjs
// Local "fake Twilio" client:
// - Mic: 8 kHz mono PCM16LE -> μ-law -> 20ms frames -> send as Twilio "media" events
// - Playback: receive μ-law frames -> decode -> play at 8 kHz
// - Announces Twilio-like "start" with mediaFormat PCMU/8000/1
// - Handles clear/stop, adds small beep on connect

const WebSocket = require('ws')
const mic = require('mic')
const Speaker = require('speaker')

// ---------- Config ----------
const WS_URL = process.env.WS_URL || 'ws://localhost:5050/media-stream'
const STREAM_SID =
  'LOCAL_MIC_' + Math.random().toString(36).slice(2, 8).toUpperCase()

const SAMPLE_RATE = 8000 // Twilio is 8 kHz
const FRAME_MS = 20 // 20ms frames
const PCM_BYTES_PER_FRAME = (SAMPLE_RATE * 2 * FRAME_MS) / 1000 // 320 bytes
const ULAW_BYTES_PER_FRAME = PCM_BYTES_PER_FRAME / 2 // 160 bytes
const PLAYBACK_GAIN = Number(process.env.PLAYBACK_GAIN || 1.8) // 1.0–3.0 typical
const MIC_DEVICE = process.env.MIC_DEVICE || undefined // e.g., "default"

// ---------- μ-law helpers ----------
function linear16ToMuLaw(sample) {
  if (sample > 32767) sample = 32767
  if (sample < -32768) sample = -32768
  const BIAS = 0x84,
    CLIP = 32635
  let sign = (sample >> 8) & 0x80
  if (sign) sample = -sample
  if (sample > CLIP) sample = CLIP
  sample += BIAS
  let e = 7
  for (let m = 0x4000; (sample & m) === 0 && e > 0; m >>= 1) e--
  const mant = (sample >> (e === 0 ? 4 : e + 3)) & 0x0f
  return ~(sign | (e << 4) | mant) & 0xff
}
function muLawToLinear16(ulawByte) {
  ulawByte = ~ulawByte & 0xff
  const sign = ulawByte & 0x80
  const exp = (ulawByte >> 4) & 0x07
  const mant = ulawByte & 0x0f
  const BIAS = 0x84
  let sample = ((mant << 3) + BIAS) << exp
  sample -= BIAS
  return sign ? -sample : sample
}
function pcm16ToMuLawFrame(pcmBuf) {
  // 320B PCM16 -> 160B μ-law
  const out = Buffer.alloc(pcmBuf.length / 2)
  for (let i = 0, j = 0; i < pcmBuf.length; i += 2, j++) {
    const s = pcmBuf.readInt16LE(i)
    out[j] = linear16ToMuLaw(s)
  }
  return out
}
function muLawToPcm16Buffer(ulawBuf, gain = 1.0) {
  const out = Buffer.alloc(ulawBuf.length * 2)
  for (let i = 0, j = 0; i < ulawBuf.length; i++, j += 2) {
    let s = muLawToLinear16(ulawBuf[i])
    if (gain !== 1.0) {
      s = Math.max(-32768, Math.min(32767, Math.round(s * gain)))
    }
    out.writeInt16LE(s, j)
  }
  return out
}

// ---------- Playback sink (8 kHz) ----------
const speaker8 = new Speaker({
  channels: 1,
  bitDepth: 16,
  sampleRate: SAMPLE_RATE,
  signed: true,
  float: false,
  endianness: 'LE',
})
speaker8.setMaxListeners(0)

// Startup beep so you know output is going to the right device
function beep() {
  const ms = 200,
    samples = Math.floor((SAMPLE_RATE * ms) / 1000)
  const buf = Buffer.alloc(samples * 2)
  const A = 9000
  for (let n = 0; n < samples; n++) {
    const v = Math.round(Math.sin(2 * Math.PI * 880 * (n / SAMPLE_RATE)) * A)
    buf.writeInt16LE(v, n * 2)
  }
  speaker8.write(buf)
}

// ---------- Main ----------
const ws = new WebSocket(WS_URL)

ws.on('open', () => {
  console.log('WS connected →', WS_URL)
  beep()

  // Tell server "a Twilio-like stream started"
  ws.send(
    JSON.stringify({
      event: 'start',
      streamSid: STREAM_SID,
      start: {
        streamSid: STREAM_SID,
        mediaFormat: { encoding: 'audio/pcmu', sampleRate: 8000, channels: 1 },
      },
    })
  )

  // Mic capture @ 8kHz, mono, PCM16LE
  const micInstance = mic({
    rate: String(SAMPLE_RATE),
    channels: '1',
    bitwidth: '16',
    encoding: 'signed-integer',
    endian: 'little',
    device: MIC_DEVICE,
    exitOnSilence: 0,
    debug: false,
  })
  const micStream = micInstance.getAudioStream()
  micInstance.start()

  let timestamp = 0
  let stash = Buffer.alloc(0)

  micStream.on('startComplete', () => {
    console.log('Mic started @ 8kHz mono → μ-law 20ms frames')
  })
  micStream.on('error', (err) => console.error('Mic error:', err))

  // Accumulate PCM16 until we have 320 bytes (20 ms) → μ-law 160B → send
  micStream.on('data', (chunk) => {
    stash = Buffer.concat([stash, chunk])
    while (stash.length >= PCM_BYTES_PER_FRAME) {
      const pcmFrame = stash.subarray(0, PCM_BYTES_PER_FRAME)
      stash = stash.subarray(PCM_BYTES_PER_FRAME)
      const ulawFrame = pcm16ToMuLawFrame(pcmFrame)

      ws.send(
        JSON.stringify({
          event: 'media',
          streamSid: STREAM_SID,
          // Twilio also sends "track": "inbound" on mic media, but it's optional for our server
          media: { payload: ulawFrame.toString('base64'), timestamp },
        })
      )

      timestamp += FRAME_MS
    }
  })
})

// Track a little stats + play received frames
let recvFrames = 0
ws.on('message', (msg) => {
  let data
  try {
    data = JSON.parse(String(msg))
  } catch {
    return
  }

  switch (data.event) {
    case 'media': {
      if (!data.media || !data.media.payload) return
      const ulaw = Buffer.from(data.media.payload, 'base64')

      // most frames should be 160B. If larger, the server is pacing multiple frames — still fine.
      // Play as soon as they arrive; Twilio would schedule per 20ms, but this sounds fine locally.
      const pcm = muLawToPcm16Buffer(ulaw, PLAYBACK_GAIN)
      const ok = speaker8.write(pcm)
      recvFrames += Math.ceil(ulaw.length / ULAW_BYTES_PER_FRAME)
      if (!ok && speaker8.listenerCount('drain') === 0)
        speaker8.once('drain', () => {})
      // log every ~50 frames
      if (recvFrames % 50 === 0) {
        console.log(
          `← received μ-law frames: ${recvFrames} (last chunk ${ulaw.length}B)`
        )
      }
      break
    }
    case 'clear': {
      // Twilio uses "clear" to flush its jitter buffer when barge-in occurs.
      // We can't flush Speaker, but we can ignore – playback will follow new frames.
      console.log('server requested clear')
      break
    }
    case 'mark': {
      // marks are fine to ignore in the sim
      break
    }
    case 'stop': {
      console.log('server requested stop')
      try {
        ws.close()
      } catch {}
      break
    }
    default:
      // ignore other events
      break
  }
})

ws.on('close', () => {
  console.log('WS closed')
  try {
    speaker8.end()
  } catch {}
})
ws.on('error', (e) => console.error('WS error:', e))
