import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── CHEF IDENTITY BLOCKS ───
const CHEF_IDENTITIES = {
  'Anthony Bourdain': `You are Anthony Bourdain — blunt, darkly funny, deeply knowledgeable, zero tolerance for pretension. You respect good technique and honest cooking above all. You swear occasionally when it fits. You do not coddle. You trust the cook to handle real information. Signature phrases: "Don't overthink it.", "Heat. Fat. Acid. That's the whole game.", "Your mise en place is your religion."`,
  'Jacques Pépin': `You are Jacques Pépin — warm, precise, classically trained, genuinely delighted by good food and good technique. You teach through story and muscle memory. You believe cooking is a gift you give people. Signature phrases: "You see, the technique, it is everything.", "Mon ami, trust your hands.", "In France we say..."`,
  'Julia Child': `You are Julia Child — enthusiastic, encouraging, utterly unflappable. You believe anyone can cook anything with enough patience and butter. You laugh at mistakes. You never shame. Signature phrases: "Bon appétit!", "If you drop it, just pick it up — who's going to know?", "The only real stumbling block is fear of failure."`,
  'Ina Garten': `You are Ina Garten — warm, confident, reassuring. You believe cooking should feel effortless and joyful, not stressful. You give people permission to relax. You favor quality ingredients over complicated technique. Signature phrases: "How easy is that?", "Store-bought is fine — I won't tell.", "Good ingredients do most of the work."`
}

// ─── OFF-TOPIC DEFLECTION POOLS ───
const DEFLECTION_POOLS = {
  'Anthony Bourdain': [
    "I have opinions about a lot of things. Right now the only opinion that matters is that your garlic is about to burn. Focus.",
    "That's a great question for someone else. Your pan is not. Pay attention.",
    "We're not doing that here. You've got a cook to finish."
  ],
  'Jacques Pépin': [
    "Another time, perhaps. But the kitchen, she is calling, and she does not wait.",
    "Mon ami, I would love to discuss this — but your butter, she is patient only so long.",
    "This is a question for philosophers. We are cooks. Back to the work."
  ],
  'Julia Child': [
    "Oh I'd love to talk about that — but your sauce is waiting and sauces are terrible gossips, they tell everyone when you ignored them.",
    "Dearie, butter waits for no one. Let's stay in the kitchen.",
    "That's for another day! Right now we cook!"
  ],
  'Ina Garten': [
    "I love that you're curious — but let's make sure dinner doesn't suffer for it, shall we?",
    "We'll save that for after. Right now the kitchen needs us.",
    "How about we circle back to that once this is on the table?"
  ]
}

function buildSystemPrompt(chef, recipe, portions, currentStepNum, substitutions, usedDeflections) {
  const steps = recipe.steps || []
  const currentStepObj = steps.find(s => s.step_number === currentStepNum)
  const nextStepObj = steps.find(s => s.step_number === currentStepNum + 1)

  // [CHEF IDENTITY]
  const identity = CHEF_IDENTITIES[chef.name] || `You are ${chef.name}.\n\nPERSONALITY: ${chef.personality_description}\nVOICE STYLE: ${chef.voice_style}`

  // [RECIPE CONTEXT] — current step only
  let recipeContext = `Recipe: ${recipe.title}\nDifficulty: ${recipe.difficulty}\nTotal time: ${recipe.total_time_minutes} min`
  if (currentStepObj) {
    let stepDesc = `Current step (${currentStepObj.step_number} of ${steps.length}): ${currentStepObj.instruction}`
    if (currentStepObj.duration_minutes > 0) stepDesc += ` [${currentStepObj.duration_minutes} min${currentStepObj.timer_needed ? ', timer recommended' : ''}]`
    if (currentStepObj.technique_notes) stepDesc += `\nTechnique: ${currentStepObj.technique_notes}`
    if (currentStepObj.chef_tip) stepDesc += `\nChef tip: ${currentStepObj.chef_tip}`

    // Key ingredients active at this step
    const stepIngredients = (recipe.ingredients || [])
      .filter(i => {
        const instrLower = (currentStepObj.instruction || '').toLowerCase()
        return instrLower.includes((i.item || '').toLowerCase())
      })
      .map(i => `${i.amount} ${i.unit} ${i.item}`)
      .join(', ')
    if (stepIngredients) stepDesc += `\nKey ingredients active at this step: ${stepIngredients}`

    recipeContext += `\n${stepDesc}`
  }
  if (nextStepObj) {
    recipeContext += `\nUpcoming step preview (do not reveal, use only to anticipate anxiety): ${nextStepObj.instruction}`
  }

  // [USER CONTEXT]
  const subsText = substitutions && substitutions.length > 0
    ? substitutions.join(', ')
    : 'None noted'
  const userContext = `Portions: ${portions} servings\nNoted substitutions: ${subsText}`

  // [CONVERSATION RULES]
  const conversationRules = `SKILL LEVEL DETECTION — do not ask, detect and adapt:
- Vague questions ("how do I know when it's done?") → beginner. Use sensory cues: color, sound, smell, texture. Be reassuring first, informative second.
- Precise terminology ("what's the fond doing here?", "should I emulsify off heat?") → advanced. Skip basics, be a peer not a teacher.
- Hesitant phrasing, typos, "I think I messed up" → nervous. Confidence before information. Always lead with "you're fine" or "we can fix this" before explaining.
- Recalibrate every 3-4 turns. If skill signals shift, match them.

RESPONSE LENGTH — strict:
- Mid-cook / time-sensitive question: 1-3 sentences. Hard stop.
- Technique question: Lead with the action, then explain. Never bury what to do.
- Encouragement: One sentence. Do not gush.
- Error recovery: Acknowledge briefly, redirect immediately. No drama.
- Off-topic: One sentence, funny, back to the cook.

SESSION CONTINUITY:
- Reference earlier user statements when relevant ("you mentioned your burner runs hot — pull back slightly here")
- Do not re-explain something already covered unless the user asks again
- If the user skipped or deviated from a step, acknowledge it matter-of-factly and adjust guidance for current reality — do not lecture about the deviation

ANTICIPATE BEFORE BEING ASKED:
- When a step is visually alarming but correct (sauce looks broken, meat looks raw on the outside), flag it proactively: "It's going to look wrong right now — that's fine, keep going."
- Give sensory checkpoints before the user asks: "You'll know it's ready when the edges start pulling away from the pan."
- One brief personality moment per session is allowed — a quote, a memory, a piece of philosophy that fits the moment. Do not force it.

STEP NAVIGATION:
- If the cook says "next" or "done", advance to the next step.
- If they say "help" or seem confused, re-explain the current step more simply.
- If they say "start over", go back to step 1.
- When a step has a duration, proactively mention setting a timer.
- If the cook asks to scale portions, recalculate proportionally.
- When starting, greet the cook in character, confirm the recipe and portions, and ask if they're ready to begin with step 1.

CULINARY KNOWLEDGE:
- When the user asks about technique, science, ingredients, substitutions, or troubleshooting, you may receive CULINARY KNOWLEDGE CONTEXT below. Use it to answer with depth and authority, but in your chef's voice. Do not mention looking anything up.`

  // [OFF-TOPIC HANDLING] — build available deflections excluding used ones
  const pool = DEFLECTION_POOLS[chef.name] || []
  const availableDeflections = pool
    .filter((_, i) => !(usedDeflections || []).includes(i))
  const deflectionList = (availableDeflections.length > 0 ? availableDeflections : pool)
    .map((d, i) => `${i + 1}. "${d}"`)
    .join('\n')
  const offTopicHandling = `If a question is clearly outside cooking (politics, relationships, tech, general knowledge, anything not food or technique), use ONE of these deflections and return immediately to the current step. Never answer the off-topic question, even partially.

Deflection options:
${deflectionList}`

  // [HARD LIMITS]
  const hardLimits = `HARD LIMITS:
- Cooking and food topics only — technique, ingredients, timing, substitutions, flavor, equipment
- No medical or dietary advice beyond obvious common sense
- No nutrition claims
- No engagement with off-topic questions, even casually
- If asked to break character: stay in character, redirect to the cook`

  return `[CHEF IDENTITY]
${identity}

[RECIPE CONTEXT]
${recipeContext}

[USER CONTEXT]
${userContext}

[CONVERSATION RULES]
${conversationRules}

[OFF-TOPIC HANDLING]
${offTopicHandling}

[HARD LIMITS]
${hardLimits}`
}

// ─── CONVERSATION HISTORY PRUNING ───
function pruneMessages(messages) {
  if (messages.length <= 12) return messages
  const first2 = messages.slice(0, 2)
  const last6 = messages.slice(-6)
  return [...first2, ...last6]
}

// SSE stream parser
async function readStream(response, onChunk) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim()
        if (jsonStr === '[DONE]') return
        try { const e = JSON.parse(jsonStr); if (e.type === 'content_block_delta' && e.delta?.text) onChunk(e.delta.text) } catch { /* ok */ }
      }
    }
  }
}

// Local storage
const CACHE_KEY = 'heardchef_session_cache'
function cacheSession(d) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)) } catch { /* ok */ } }
function getCachedSession() { try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : null } catch { return null } }
function clearCachedSession() { try { localStorage.removeItem(CACHE_KEY) } catch { /* ok */ } }

// Speech Recognition
const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const speechSupported = !!SpeechRecognition
const synthSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

// ─── SENTENCE-LEVEL STREAMING TTS AUDIO QUEUE ───
class AudioQueue {
  constructor() {
    this.queue = []
    this.playing = false
    this.cancelled = false
    this.currentAudio = null
    this.rate = 1.0
    this.onStateChange = null
    this.onFinished = null
  }

  setRate(r) { this.rate = r; if (this.currentAudio) this.currentAudio.playbackRate = r }

  async enqueue(audioBlob) {
    if (this.cancelled) return
    const url = URL.createObjectURL(audioBlob)
    this.queue.push(url)
    if (!this.playing) this._playNext()
  }

  async _playNext() {
    if (this.cancelled || this.queue.length === 0) {
      this.playing = false
      this.currentAudio = null
      this.onFinished?.()
      return
    }
    this.playing = true
    this.onStateChange?.('chef_speaking')
    const url = this.queue.shift()
    const audio = new Audio(url)
    audio.playbackRate = this.rate
    this.currentAudio = audio

    return new Promise(resolve => {
      audio.onended = () => { this.currentAudio = null; URL.revokeObjectURL(url); resolve(); this._playNext() }
      audio.onerror = () => { this.currentAudio = null; URL.revokeObjectURL(url); resolve(); this._playNext() }
      audio.play().catch(() => { this.currentAudio = null; URL.revokeObjectURL(url); resolve(); this._playNext() })
    })
  }

  stop() {
    this.cancelled = true
    this.queue = []
    if (this.currentAudio) { this.currentAudio.pause(); this.currentAudio.src = ''; this.currentAudio = null }
    if (synthSupported) window.speechSynthesis.cancel()
    this.playing = false
  }

  reset() { this.cancelled = false; this.queue = []; this.playing = false; this.currentAudio = null }

  get isPlaying() { return this.playing }
}

// Fetch TTS for a single sentence
async function fetchTTSBlob(text, voiceId) {
  const res = await fetch('/api/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId })
  })
  if (!res.ok) return null
  return await res.blob()
}

// Web Speech fallback for full text
function fallbackSpeak(text, rate, onDone) {
  if (!synthSupported) { onDone?.(); return }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text); u.rate = rate
  u.onend = () => onDone?.(); u.onerror = () => onDone?.()
  window.speechSynthesis.speak(u)
}

// ─── VOICE ACTIVITY DETECTION (VAD) ───
class VoiceActivityDetector {
  constructor(onVoiceDetected) {
    this.onVoiceDetected = onVoiceDetected
    this.audioCtx = null
    this.analyser = null
    this.stream = null
    this.rafId = null
    this.active = false
    this.threshold = 25 // Volume threshold (0-128 range)
    this.consecutiveFrames = 0
    this.requiredFrames = 3 // Need 3 consecutive frames above threshold
  }

  async start() {
    if (this.active) return
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const source = this.audioCtx.createMediaStreamSource(this.stream)
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.smoothingTimeConstant = 0.3
      source.connect(this.analyser)
      this.active = true
      this._poll()
    } catch { /* mic access denied or unavailable */ }
  }

  _poll() {
    if (!this.active || !this.analyser) return
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    const avg = data.reduce((a, b) => a + b, 0) / data.length

    if (avg > this.threshold) {
      this.consecutiveFrames++
      if (this.consecutiveFrames >= this.requiredFrames) {
        this.consecutiveFrames = 0
        this.onVoiceDetected?.()
      }
    } else {
      this.consecutiveFrames = 0
    }

    this.rafId = requestAnimationFrame(() => this._poll())
  }

  stop() {
    this.active = false
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null }
    if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null }
    this.analyser = null
    this.consecutiveFrames = 0
  }
}

// Icons
function MicIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="1" width="6" height="11" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
}
function SpeakerIcon({ className, on }) {
  return on
    ? <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
    : <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
}

export default function CookingSession() {
  const { recipeId } = useParams()
  const [recipe, setRecipe] = useState(null)
  const [chef, setChef] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [currentStep, setCurrentStep] = useState(0)
  const [portions, setPortions] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [substitutions, setSubstitutions] = useState([])
  const [usedDeflections, setUsedDeflections] = useState([])
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [pendingMessages, setPendingMessages] = useState([])
  const [voiceMode, setVoiceMode] = useState(speechSupported)
  const [micMuted, setMicMuted] = useState(false)
  const [micPermission, setMicPermission] = useState('prompt')
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [convState, setConvState] = useState('idle')
  const [viewportHeight, setViewportHeight] = useState(null)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const wakeLockRef = useRef(null)
  const msgCountSinceLastSave = useRef(0)
  const recognitionRef = useRef(null)
  const sendMessageRef = useRef(null)
  const voiceModeRef = useRef(speechSupported)
  const micMutedRef = useRef(false)
  const convStateRef = useRef('idle')
  const audioQueueRef = useRef(new AudioQueue())
  const vadRef = useRef(null)
  const chefRef = useRef(null)

  voiceModeRef.current = voiceMode
  micMutedRef.current = micMuted
  convStateRef.current = convState

  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [])
  useEffect(() => { scrollToBottom() }, [messages, streamingText, scrollToBottom])

  useEffect(() => {
    if (!window.visualViewport) return
    const h = () => { setViewportHeight(window.visualViewport.height); scrollToBottom() }
    window.visualViewport.addEventListener('resize', h); window.visualViewport.addEventListener('scroll', h); h()
    return () => { window.visualViewport.removeEventListener('resize', h); window.visualViewport.removeEventListener('scroll', h) }
  }, [scrollToBottom])

  // ─── MIC CONTROL ───
  function startMic() {
    if (!speechSupported || !recognitionRef.current || micMutedRef.current || !voiceModeRef.current) return
    if (convStateRef.current === 'chef_speaking') return
    try { recognitionRef.current.start(); setConvState('listening'); convStateRef.current = 'listening' } catch { /* ok */ }
  }
  function stopMic() {
    if (!recognitionRef.current) return
    try { recognitionRef.current.stop() } catch { /* ok */ }
    if (convStateRef.current === 'listening') { setConvState('idle'); convStateRef.current = 'idle' }
  }

  // ─── STOP ALL AUDIO ───
  function stopAllAudio() {
    audioQueueRef.current.stop()
    if (synthSupported) window.speechSynthesis.cancel()
  }

  // ─── VAD: Instant interruption ───
  function handleVoiceInterrupt() {
    if (convStateRef.current !== 'chef_speaking') return
    // Instant stop — user started talking
    stopAllAudio()
    vadRef.current?.stop()
    setConvState('idle'); convStateRef.current = 'idle'
    // Start speech recognition to capture what they're saying
    if (voiceModeRef.current && !micMutedRef.current) {
      setTimeout(() => startMic(), 100)
    }
  }

  // ─── Initialize VAD ───
  useEffect(() => {
    vadRef.current = new VoiceActivityDetector(handleVoiceInterrupt)
    return () => { vadRef.current?.stop() }
  }, [])

  // ─── SENTENCE-LEVEL STREAMING TTS ───
  // Called when a new assistant message arrives. Instead of waiting for full text,
  // this is now triggered sentence-by-sentence during streaming (see sendMessage/initSession).
  // The old lastMsgCountRef effect is replaced by inline streaming TTS.

  // Speak a single sentence via audio queue
  async function speakSentence(sentence, voiceId) {
    if (!voiceId) { return } // fallback handled at full-text level
    const blob = await fetchTTSBlob(sentence, voiceId)
    if (blob && !audioQueueRef.current.cancelled) {
      await audioQueueRef.current.enqueue(blob)
    }
  }

  useEffect(() => { return () => { stopAllAudio(); vadRef.current?.stop() } }, [])

  // ─── SPEECH RECOGNITION ───
  useEffect(() => {
    if (!speechSupported) return
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim()
      if (!transcript) return
      if (/repeat\s*that|say\s*that\s*again/i.test(transcript)) { sendMessageRef.current?.('__REPEAT__'); return }
      sendMessageRef.current?.(transcript)
    }

    recognition.onend = () => {
      if (voiceModeRef.current && !micMutedRef.current && convStateRef.current !== 'chef_speaking' && convStateRef.current !== 'thinking') {
        setTimeout(() => {
          if (voiceModeRef.current && !micMutedRef.current && convStateRef.current !== 'chef_speaking' && convStateRef.current !== 'thinking') {
            try { recognition.start(); setConvState('listening'); convStateRef.current = 'listening' } catch { /* ok */ }
          } else { if (convStateRef.current === 'listening') { setConvState('idle'); convStateRef.current = 'idle' } }
        }, 400)
      } else { if (convStateRef.current === 'listening') { setConvState('idle'); convStateRef.current = 'idle' } }
    }

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') { setMicPermission('denied'); return }
      if (voiceModeRef.current && !micMutedRef.current && event.error !== 'not-allowed' && convStateRef.current !== 'chef_speaking') {
        setTimeout(() => {
          if (voiceModeRef.current && !micMutedRef.current && convStateRef.current !== 'chef_speaking') {
            try { recognition.start(); setConvState('listening'); convStateRef.current = 'listening' } catch { /* ok */ }
          }
        }, event.error === 'no-speech' ? 300 : 1000)
      }
    }

    recognitionRef.current = recognition
    return () => { try { recognition.abort() } catch { /* ok */ }; recognitionRef.current = null }
  }, [])

  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'microphone' }).then(r => { setMicPermission(r.state); r.onchange = () => setMicPermission(r.state) }).catch(() => {})
    }
  }, [])

  // ─── WAKE LOCK ───
  useEffect(() => {
    async function acquire() { if ('wakeLock' in navigator) { try { wakeLockRef.current = await navigator.wakeLock.request('screen'); wakeLockRef.current.addEventListener('release', () => { wakeLockRef.current = null }) } catch { /* ok */ } } }
    acquire()
    const h = () => { if (document.visibilityState === 'visible' && !wakeLockRef.current) acquire() }
    document.addEventListener('visibilitychange', h)
    return () => { document.removeEventListener('visibilitychange', h); if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null } }
  }, [])

  useEffect(() => {
    const off = () => setIsOffline(true)
    const on = () => { setIsOffline(false); setPendingMessages(p => { if (p.length > 0) { p.forEach(m => sendMessage(m, true)); return [] } return p }) }
    window.addEventListener('offline', off); window.addEventListener('online', on)
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on) }
  }, [])

  useEffect(() => { if (recipe && messages.length > 0) cacheSession({ recipeId, recipe, chef, messages, currentStep, portions, sessionId, substitutions, usedDeflections }) }, [messages, recipe, chef, currentStep, portions, sessionId, recipeId, substitutions, usedDeflections])

  useEffect(() => {
    if (!sessionId || messages.length === 0) return
    msgCountSinceLastSave.current++
    if (msgCountSinceLastSave.current >= 5) { msgCountSinceLastSave.current = 0; supabase.from('cooking_sessions').update({ conversation_history: messages }).eq('id', sessionId).then() }
  }, [messages, sessionId])

  useEffect(() => {
    if (sessionEnded || !sessionId) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [sessionEnded, sessionId])

  // Load recipe + chef
  useEffect(() => {
    async function load() {
      const { data: rd } = await supabase.from('recipes').select('*').eq('id', recipeId).single()
      if (rd) { const { data: cd } = await supabase.from('chefs').select('*').eq('id', rd.chef_id).single(); setChef(cd); chefRef.current = cd; setPortions(rd.servings); setRecipe(rd) }
      else { const c = getCachedSession(); if (c && c.recipeId === recipeId) { setRecipe(c.recipe); setChef(c.chef); chefRef.current = c.chef; setMessages(c.messages || []); setCurrentStep(c.currentStep || 0); setPortions(c.portions); setSessionId(c.sessionId); setSubstitutions(c.substitutions || []); setUsedDeflections(c.usedDeflections || []) } }
      setLoading(false)
    }
    load()
  }, [recipeId])

  // ─── STREAMING TTS: Process a stream with sentence-level TTS ───
  async function streamWithTTS(fetchRes, onFullText) {
    const aq = audioQueueRef.current
    aq.reset()
    aq.setRate(playbackRate)
    aq.onStateChange = (s) => { setConvState(s); convStateRef.current = s }
    aq.onFinished = () => {
      vadRef.current?.stop()
      setConvState('idle'); convStateRef.current = 'idle'
      if (voiceModeRef.current && !micMutedRef.current) setTimeout(() => startMic(), 400)
    }

    stopMic()
    setConvState('thinking'); convStateRef.current = 'thinking'

    // Start VAD to detect interruptions while speaking
    if (voiceModeRef.current) vadRef.current?.start()

    let fullText = ''
    let sentenceBuffer = ''
    const voiceId = chefRef.current?.voice_id

    await readStream(fetchRes, (chunk) => {
      if (aq.cancelled) return
      fullText += chunk
      setStreamingText(fullText)

      if (voiceId && voiceModeRef.current) {
        sentenceBuffer += chunk
        // Check for complete sentences
        const sentenceMatch = sentenceBuffer.match(/^(.*?[.!?])\s*(.*)$/s)
        if (sentenceMatch) {
          const completeSentence = sentenceMatch[1].trim()
          sentenceBuffer = sentenceMatch[2]
          if (completeSentence.length > 2) {
            speakSentence(completeSentence, voiceId)
          }
        }
      }
    })

    // Flush remaining buffer
    if (voiceId && voiceModeRef.current && sentenceBuffer.trim().length > 2 && !aq.cancelled) {
      speakSentence(sentenceBuffer.trim(), voiceId)
    }

    // If no voice or TTS failed, use fallback for full text
    if (!voiceId || !voiceModeRef.current) {
      if (voiceModeRef.current && fullText) {
        setConvState('chef_speaking'); convStateRef.current = 'chef_speaking'
        await new Promise(resolve => fallbackSpeak(fullText, playbackRate, resolve))
        setConvState('idle'); convStateRef.current = 'idle'
        if (voiceModeRef.current && !micMutedRef.current) setTimeout(() => startMic(), 400)
      }
    }

    onFullText(fullText)
  }

  // Create session + initial greeting
  useEffect(() => {
    if (!recipe || !chef || sessionId) return
    async function initSession() {
      const { data: session } = await supabase.from('cooking_sessions').insert({ recipe_id: recipe.id, portions: recipe.servings, conversation_history: [], started_at: new Date().toISOString() }).select('id').single()
      if (session) setSessionId(session.id)
      const system = buildSystemPrompt(chef, recipe, recipe.servings, 1, [], [])
      setSending(true); setStreamingText('')
      try {
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system, messages: [{ role: 'user', content: 'I want to cook this recipe. Let\'s get started!' }], stream: true }) })
        if (!res.ok) throw new Error('API error')
        await streamWithTTS(res, (fullText) => {
          if (fullText) { setStreamingText(''); setMessages([{ role: 'assistant', content: fullText }]); setCurrentStep(1) }
        })
      } catch { setStreamingText(''); setMessages([{ role: 'assistant', content: 'Having trouble connecting. Please refresh and try again.' }]) }
      setSending(false)
    }
    initSession()
  }, [recipe, chef, sessionId])

  async function sendMessage(text, isRetry = false) {
    if (sending || sessionEnded) return

    // Repeat
    if (text === '__REPEAT__') {
      const last = [...messages].reverse().find(m => m.role === 'assistant')
      if (last && voiceMode && chefRef.current?.voice_id) {
        stopMic(); stopAllAudio()
        const aq = audioQueueRef.current; aq.reset(); aq.setRate(playbackRate)
        aq.onStateChange = (s) => { setConvState(s); convStateRef.current = s }
        aq.onFinished = () => { setConvState('idle'); convStateRef.current = 'idle'; if (voiceModeRef.current && !micMutedRef.current) setTimeout(() => startMic(), 400) }
        setConvState('chef_speaking'); convStateRef.current = 'chef_speaking'
        if (voiceModeRef.current) vadRef.current?.start()
        const sentences = last.content.match(/[^.!?]+[.!?]+\s*/g) || [last.content]
        for (const s of sentences) { if (aq.cancelled) break; await speakSentence(s.trim(), chefRef.current.voice_id) }
      }
      return
    }

    if (!text.trim()) return
    stopMic(); stopAllAudio(); vadRef.current?.stop()
    setConvState('thinking'); convStateRef.current = 'thinking'

    if (isOffline && !isRetry) { setMessages(p => [...p, { role: 'user', content: text.trim() }]); setPendingMessages(p => [...p, text.trim()]); setInput(''); return }

    const userMsg = { role: 'user', content: text.trim() }
    if (!isRetry) { setMessages(p => [...p, userMsg]); setInput('') }
    setSending(true); setStreamingText('')

    const lt = text.toLowerCase()
    let nextStep = currentStep
    if (lt === 'next step' || lt === 'done' || lt === 'next') { nextStep = Math.min(currentStep + 1, (recipe.steps || []).length); setCurrentStep(nextStep) }
    else if (lt === 'start over') { nextStep = 1; setCurrentStep(1) }

    // Detect substitutions mentioned by the user
    const subMatch = text.match(/(?:substitut|replac|swap|use|using)\w*\s+(.+?)(?:\s+(?:instead|for|rather)\s|$)/i)
    let currentSubs = substitutions
    if (subMatch) { currentSubs = [...substitutions, subMatch[0].trim()]; setSubstitutions(currentSubs) }

    const system = buildSystemPrompt(chef, recipe, portions, nextStep, currentSubs, usedDeflections)
    const cur = isRetry ? messages : [...messages, userMsg]
    const prunedCur = pruneMessages(cur)
    const api = [{ role: 'user', content: 'I want to cook this recipe. Let\'s get started!' }, ...prunedCur]
    const nav = ['next', 'next step', 'done', 'start over', 'help', 'ok', 'okay', 'yes', 'no', 'ready', 'got it']
    const isQ = !nav.includes(lt) && lt.length > 3

    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system, messages: api, stream: true, ...(isQ && { ragQuery: text.trim(), currentStep: nextStep }) }) })
      if (!res.ok) throw new Error('API error')
      await streamWithTTS(res, (fullText) => {
        if (fullText) {
          setStreamingText(''); setMessages(p => [...p, { role: 'assistant', content: fullText }])
          const sm = fullText.match(/[Ss]tep\s+(\d+)/i); if (sm) setCurrentStep(parseInt(sm[1], 10))
          // Track deflection usage — check if response matches a deflection line
          const pool = DEFLECTION_POOLS[chef.name] || []
          pool.forEach((d, i) => { if (fullText.includes(d.substring(0, 30))) setUsedDeflections(p => p.includes(i) ? p : [...p, i]) })
        } else { setStreamingText(''); setMessages(p => [...p, { role: 'assistant', content: 'Sorry, I had trouble responding. Could you try again?' }]) }
      })
    } catch {
      setStreamingText('')
      if (!navigator.onLine) { setIsOffline(true); setPendingMessages(p => [...p, text.trim()]); setMessages(p => [...p, { role: 'assistant', content: 'You seem to be offline. Your message is saved and will be sent when you reconnect.' }]) }
      else setMessages(p => [...p, { role: 'assistant', content: 'Connection error. Please try again.' }])
    }
    setSending(false)
  }

  sendMessageRef.current = sendMessage

  async function endSession() {
    stopAllAudio(); stopMic(); vadRef.current?.stop()
    setConvState('idle'); convStateRef.current = 'idle'
    if (sessionId) await supabase.from('cooking_sessions').update({ completed_at: new Date().toISOString(), conversation_history: messages }).eq('id', sessionId)
    clearCachedSession()
    if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null }
    setSessionEnded(true)
  }

  function handleSubmit(e) { e.preventDefault(); sendMessage(input) }
  function toggleVoiceMode() {
    const next = !voiceMode; setVoiceMode(next); voiceModeRef.current = next
    if (!next) { stopMic(); stopAllAudio(); vadRef.current?.stop(); setConvState('idle'); convStateRef.current = 'idle' }
    else if (convStateRef.current !== 'chef_speaking' && convStateRef.current !== 'thinking') startMic()
  }
  function toggleMute() {
    const next = !micMuted; setMicMuted(next); micMutedRef.current = next
    if (next) stopMic()
    else if (convStateRef.current !== 'chef_speaking' && convStateRef.current !== 'thinking') startMic()
  }

  const speedOptions = [0.75, 1, 1.25, 1.5]

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-amber-gold text-lg">Preparing your kitchen...</div></div>
  if (!recipe || !chef) return <div className="text-center pt-12 text-neutral-400">Recipe not found.</div>

  const steps = recipe.steps || []
  const activeStep = steps.find(s => s.step_number === currentStep)

  if (sessionEnded) return (
    <div className="pt-8 text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h1 className="text-2xl font-bold text-white mb-2">Great cooking!</h1>
      <p className="text-neutral-400 mb-6">Your session has been saved.</p>
      <Link to={`/recipe/${recipe.id}`} className="inline-block bg-amber-gold text-neutral-900 font-semibold py-3 px-8 rounded-xl hover:bg-amber-light transition-colors">Back to Recipe</Link>
    </div>
  )

  const stateLabel = convState === 'chef_speaking' ? 'Chef is speaking...' : convState === 'listening' ? 'Listening...' : convState === 'thinking' ? 'Thinking...' : null
  const stateColor = convState === 'chef_speaking' ? 'text-amber-gold' : convState === 'listening' ? 'text-red-400' : convState === 'thinking' ? 'text-blue-400' : ''

  return (
    <div className="flex flex-col" style={{ height: viewportHeight ? `${viewportHeight - 65}px` : 'calc(100dvh - 65px)' }}>
      {micPermission === 'denied' && <div className="bg-red-900/30 border-b border-red-700/30 px-4 py-2 text-center shrink-0"><span className="text-red-400 text-sm">Microphone access denied. Enable in browser settings.</span></div>}
      {isOffline && <div className="bg-amber-gold/20 border-b border-amber-gold/30 px-4 py-2 text-center shrink-0"><span className="text-amber-gold text-sm font-medium">Reconnecting...</span></div>}

      <div className="bg-dark-card border-b border-dark-border px-3 py-2 flex items-center justify-between shrink-0 gap-1">
        <button onClick={toggleVoiceMode} className={`flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${voiceMode ? 'bg-amber-gold/20 border border-amber-gold/50 text-amber-gold' : 'bg-neutral-800 border border-dark-border text-neutral-400'}`}>
          {voiceMode ? <><SpeakerIcon className="w-3.5 h-3.5" on={true} /><span>Voice</span></> : <span>Text Mode</span>}
        </button>
        {voiceMode && speechSupported && (
          <button onClick={toggleMute} className={`flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${micMuted ? 'bg-red-500/20 border border-red-500/50 text-red-400' : 'bg-neutral-800 border border-dark-border text-neutral-400'}`}>
            <MicIcon className="w-3.5 h-3.5" /><span>{micMuted ? 'Muted' : 'Mic On'}</span>
          </button>
        )}
        <div className="flex items-center gap-0.5">
          {speedOptions.map(s => (
            <button key={s} onClick={() => { setPlaybackRate(s); audioQueueRef.current.setRate(s) }}
              className={`min-h-[32px] min-w-[32px] rounded-md text-xs font-medium transition-colors cursor-pointer ${playbackRate === s ? 'bg-amber-gold text-neutral-900' : 'text-neutral-500 hover:text-neutral-300'}`}>{s}x</button>
          ))}
        </div>
      </div>

      {stateLabel && (
        <div className="bg-dark-card/80 border-b border-dark-border px-4 py-1.5 text-center shrink-0">
          <span className={`text-xs font-medium ${stateColor} flex items-center justify-center gap-2`}>
            {convState === 'chef_speaking' && <SpeakerIcon className="w-3.5 h-3.5" on={true} />}
            {convState === 'listening' && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
            {convState === 'thinking' && <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />}
            {stateLabel}
            {convState === 'chef_speaking' && (
              <button onClick={() => { stopAllAudio(); vadRef.current?.stop(); setConvState('idle'); convStateRef.current = 'idle'; if (voiceModeRef.current && !micMutedRef.current) setTimeout(() => startMic(), 300) }}
                className="text-neutral-500 hover:text-white ml-1 cursor-pointer text-sm">skip</button>
            )}
          </span>
        </div>
      )}

      {activeStep && (
        <div className="bg-dark-card border-b border-dark-border px-4 py-3 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-amber-gold font-semibold text-sm">Step {activeStep.step_number} of {steps.length}</span>
            {activeStep.duration_minutes > 0 && <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">{activeStep.timer_needed ? '⏱️' : '⏰'} {activeStep.duration_minutes} min</span>}
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed line-clamp-2">{activeStep.instruction}</p>
          <div className="mt-2 h-1 bg-neutral-800 rounded-full overflow-hidden"><div className="h-full bg-amber-gold rounded-full transition-all duration-500" style={{ width: `${(currentStep / steps.length) * 100}%` }} /></div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" aria-live="polite">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-amber-gold text-neutral-900' : 'bg-dark-card border border-dark-border text-neutral-200'}`}>
              <p className="text-[16px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {streamingText && (
          <div className="flex justify-start"><div className="max-w-[85%] rounded-2xl px-4 py-3 bg-dark-card border border-dark-border text-neutral-200"><p className="text-[16px] leading-relaxed whitespace-pre-wrap">{streamingText}</p></div></div>
        )}
        {sending && !streamingText && (
          <div className="flex justify-start"><div className="bg-dark-card border border-dark-border rounded-2xl px-4 py-3"><div className="flex gap-1">
            <span className="w-2 h-2 bg-amber-gold/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-amber-gold/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-amber-gold/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div></div></div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 py-2 flex gap-2 overflow-x-auto shrink-0">
        {['Done', 'Next Step', 'Repeat', 'Help', 'Start Over'].map(label => (
          <button key={label} onClick={() => sendMessage(label === 'Repeat' ? '__REPEAT__' : label)} disabled={sending}
            className="shrink-0 min-h-[48px] min-w-[48px] bg-dark-card border border-dark-border text-neutral-300 text-sm font-medium px-5 py-3 rounded-full hover:border-amber-gold/50 hover:text-amber-gold transition-colors disabled:opacity-50 cursor-pointer active:scale-95">{label}</button>
        ))}
        <button onClick={endSession} disabled={sending}
          className="shrink-0 min-h-[48px] min-w-[48px] bg-red-900/30 border border-red-700/40 text-red-400 text-sm font-medium px-5 py-3 rounded-full hover:border-red-500/50 transition-colors disabled:opacity-50 cursor-pointer active:scale-95">End Session</button>
      </div>

      <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2 shrink-0">
        <div className="flex gap-2 items-center">
          <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
            placeholder={voiceMode ? (convState === 'listening' ? 'Listening... or type here' : 'Type here or just speak...') : 'Ask your sous chef anything...'}
            disabled={sending}
            className="flex-1 min-h-[48px] bg-dark-card border border-dark-border rounded-xl px-4 py-3 text-[16px] text-white placeholder-neutral-600 focus:outline-none focus:border-amber-gold/50 disabled:opacity-50" />
          <button type="submit" disabled={sending || !input.trim()}
            className="min-h-[48px] min-w-[48px] bg-amber-gold text-neutral-900 font-semibold px-5 py-3 rounded-xl hover:bg-amber-light transition-colors disabled:opacity-50 cursor-pointer active:scale-95">Send</button>
        </div>
      </form>
    </div>
  )
}
