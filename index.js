import Fastify from 'fastify'
import WebSocket from 'ws'
import dotenv from 'dotenv'
import fastifyFormBody from '@fastify/formbody'
import fastifyWs from '@fastify/websocket'
import twilio from 'twilio'

// Load environment variables from .env file
dotenv.config()

// Retrieve OpenAI and Twilio credentials
const { OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env

if (!OPENAI_API_KEY) {
  console.error('Missing OpenAI API key. Please set it in the .env file.')
  process.exit(1)
}

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error('Missing Twilio credentials. Please set them in the .env file.')
  process.exit(1)
}
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

// Initialize Fastify
const fastify = Fastify()
fastify.register(fastifyFormBody)
fastify.register(fastifyWs)

// Constants
const VOICE = 'alloy'
const TEMPERATURE = 0.8
const PORT = process.env.PORT || 5050

const LOG_EVENT_TYPES = [
  'error',
  'response.done',
  'session.updated',
  'input_audio_buffer.speech_started',
]

// NEW: Function to generate the system message dynamically with company and order details.
const getSystemMessage = (company, orderId) => {
  return `Ju jeni një asistent zanor që telefonon nga ${company}. Detyra juaj është të konfirmoni porosinë me numër ${orderId}. Flisni shqip. Pasi përdoruesi përgjigjet, ose falënderojeni për konfirmimin ose thojuni se një përfaqësues do t'i kontaktojë. Mbylleni bisedën me "Mirupafshim!".`
}

// Root Route
fastify.get('/', async (request, reply) => {
  reply.send({ message: 'Twilio Media Stream Server is running!' })
})

// Route for Twilio to handle incoming calls
fastify.all('/incoming-call', async (request, reply) => {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                          <Response>
                              <Pause length="1"/>
                              <Connect>
                                  <Stream url="wss://${request.headers.host}/media-stream" />
                              </Connect>
                          </Response>`

  reply.type('text/xml').send(twimlResponse)
})

// WebSocket route for media-stream
fastify.register(async (fastify) => {
  fastify.get('/media-stream', { websocket: true }, (connection, req) => {
    console.log('Client connected')

    // Connection-specific state
    let streamSid = null
    let callSid = null
    let hasUserSpoken = false
    let isHangupMarkSent = false

    // NEW: Generate random company and order ID for each new call.
    const companies = ['Shopaz', 'Gjirafa']
    const randomCompany =
      companies[Math.floor(Math.random() * companies.length)]
    const randomOrderId = Math.floor(100000 + Math.random() * 900000) // 6-digit ID

    console.log(
      `New call initiated for: ${randomCompany}, Order ID: ${randomOrderId}`
    )

    const openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=${TEMPERATURE}`,
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    )

    const hangupCall = async (callSid) => {
      if (!callSid) return
      try {
        console.log(`Hanging up call now: ${callSid}`)
        await twilioClient.calls(callSid).update({ status: 'completed' })
      } catch (error) {
        console.error('Error hanging up call:', error)
      }
    }

    // Control initial session with OpenAI
    const initializeSession = () => {
      const sessionUpdate = {
        type: 'session.update',
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          output_modalities: ['audio'],
          audio: {
            input: {
              format: { type: 'audio/pcmu' },
              turn_detection: { type: 'server_vad' },
            },
            output: { format: { type: 'audio/pcmu' }, voice: VOICE },
          },
          // UPDATED: Use the dynamic system message.
          instructions: getSystemMessage(randomCompany, randomOrderId),
        },
      }
      console.log('Sending session update:', JSON.stringify(sessionUpdate))
      openAiWs.send(JSON.stringify(sessionUpdate))
      // UPDATED: Pass the dynamic data to the initial greeting function.
      sendInitialConversationItem(randomCompany, randomOrderId)
    }

    // UPDATED: Function now accepts and uses the dynamic company and order ID.
    const sendInitialConversationItem = (company, orderId) => {
      openAiWs.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Përshëndeteni përdoruesin në shqip me "Përshëndetje, po ju telefonojmë nga ${company} për të konfirmuar porosinë tuaj me numër ${orderId}. A është gjithçka në rregull për ta konfirmuar?"`,
              },
            ],
          },
        })
      )
      openAiWs.send(JSON.stringify({ type: 'response.create' }))
    }

    openAiWs.on('open', () => {
      console.log('Connected to the OpenAI Realtime API')
      setTimeout(initializeSession, 100)
    })

    // Listen for messages from the OpenAI WebSocket
    openAiWs.on('message', (data) => {
      try {
        const response = JSON.parse(data)

        if (LOG_EVENT_TYPES.includes(response.type)) {
          console.log(`Received event: ${response.type}`, response)
        }

        if (response.type === 'response.output_audio.delta' && response.delta) {
          connection.send(
            JSON.stringify({
              event: 'media',
              streamSid: streamSid,
              media: { payload: response.delta },
            })
          )
        }

        if (response.type === 'input_audio_buffer.speech_started') {
          hasUserSpoken = true
        }

        if (response.type === 'response.done') {
          if (hasUserSpoken && response.response.status === 'completed') {
            console.log(
              'Final response generated. Sending hangup mark to Twilio.'
            )
            connection.send(
              JSON.stringify({
                event: 'mark',
                streamSid: streamSid,
                mark: { name: 'hangup_mark' },
              })
            )
            isHangupMarkSent = true
          }
        }
      } catch (error) {
        console.error('Error processing OpenAI message:', error)
      }
    })

    // Handle incoming messages from Twilio
    connection.on('message', (message) => {
      try {
        const data = JSON.parse(message)

        switch (data.event) {
          case 'media':
            if (openAiWs.readyState === WebSocket.OPEN) {
              openAiWs.send(
                JSON.stringify({
                  type: 'input_audio_buffer.append',
                  audio: data.media.payload,
                })
              )
            }
            break
          case 'start':
            streamSid = data.start.streamSid
            callSid = data.start.callSid
            console.log(
              `Incoming stream has started: Stream SID ${streamSid}, Call SID ${callSid}`
            )
            hasUserSpoken = false
            isHangupMarkSent = false
            break
          case 'mark':
            console.log('Received mark from Twilio:', data.mark.name)
            if (isHangupMarkSent && data.mark.name === 'hangup_mark') {
              console.log('Hangup mark received. Terminating call.')
              hangupCall(callSid)
            }
            break
        }
      } catch (error) {
        console.error('Error parsing message:', error)
      }
    })

    // Handle connection close and errors
    connection.on('close', () => {
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close()
      console.log('Client disconnected.')
    })
    openAiWs.on('close', () =>
      console.log('Disconnected from the OpenAI Realtime API')
    )
    openAiWs.on('error', (error) =>
      console.error('Error in the OpenAI WebSocket:', error)
    )
  })
})

fastify.listen({ port: PORT }, (err) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`Server is listening on port ${PORT}`)
})
