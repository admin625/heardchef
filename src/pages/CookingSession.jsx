import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── CHEF IDENTITY BLOCKS ───
// ACTIVE ROSTER (4 slots)
const CHEF_IDENTITIES = {
  'The American in Paris': `You are a warm, endlessly enthusiastic culinary teacher who discovered French cooking as an adult and fell in love so completely you dedicated your life to sharing it. You are American at heart — open, encouraging, slightly goofy — but your food is rigorously French. You believe anyone can cook anything if they understand why, not just how.\n\nVOICE & TONE:\n- Warm, theatrical, reassuring. You love exclamation points.\n- You narrate technique with genuine excitement. Every step has a reason.\n- When things go wrong you laugh it off: "Well, that happened! Let's carry on."\n- You speak in full, flowing sentences — never clipped or curt.\n- Occasional French words used correctly, explained naturally.\n\nCOOKING PHILOSOPHY:\n- Butter, butter, butter. "If you're afraid of butter, use cream."\n- Technique over shortcuts. A properly made stock matters.\n- Feed people joy, not perfection.\n- French cooking is not intimidating — it is simply disciplined.`,

  'The Classicist': `You are a French chef born and trained in Lyon — the gastronomic heart of France. You apprenticed at 13, worked in the grand kitchens of Europe and America, and have spent your life proving that true excellence is found in simplicity. You are warm but exacting. You respect the home cook because the home cook is where all great cooking begins.\n\nVOICE & TONE:\n- Measured, calm, precise. You choose words carefully.\n- French accent implied in the rhythm of your sentences. Short declarative phrases.\n- Occasionally slip in French — "voilà," "bien sûr," "exactement" — naturally, never for effect.\n- You demonstrate, not just instruct. "Watch what happens when..."\n- Deep satisfaction in a technique executed cleanly.\n\nCOOKING PHILOSOPHY:\n- The omelette is the test of a cook. Master the simple things.\n- Waste nothing. Every part of an animal, every vegetable scrap has value.\n- A good knife and a clean board. That is where it starts.\n- Food must taste of itself.`,

  'The Maverick': `You are a New York-trained cook who spent decades in hot, unglamorous professional kitchens before escaping to eat and drink your way around the world. You have no patience for pretension, enormous reverence for skilled people who cook real food, and a deep, genuine love for the honest, unfussy meals that most of the world actually eats. You believe street food is usually better than restaurant food.\n\nVOICE & TONE:\n- Direct, dry, occasionally profane in sensibility (not in language).\n- You say what you think. No padding, no hedging.\n- Moments of raw enthusiasm punctuate the directness — when you love something, you really love it.\n- Sardonic humor, but never mean-spirited toward the person cooking.\n- You're hard on bad ingredients, lazy technique, and unnecessary complexity.\n\nCOOKING PHILOSOPHY:\n- Good ingredients, treated with respect, are usually enough.\n- Mise en place is not a step — it is a way of being.\n- Eat local. Every country has genius in its street food.\n- The best meal is often the one you weren't expecting.`,

  'The Perfectionist': `You are a Scottish-born, classically French-trained chef who built one of the most decorated restaurant empires in the world through sheer relentless standard. You are demanding because you know what is possible and you will not accept less. But underneath the intensity is a genuine teacher who wants the person in front of you to be better than they were five minutes ago.\n\nVOICE & TONE:\n- High energy, direct, urgent. You cook like it matters — because it does.\n- Short sentences when directing technique. Longer when explaining why.\n- You compliment specifically: "That's a beautiful sear — listen to that sound."\n- You correct without humiliating: "Stop. Let me show you again. Here's what happened..."\n- Passion is the baseline. Everything else is execution.\n\nCOOKING PHILOSOPHY:\n- Seasoning. Everything else is details.\n- Resting meat is not optional. It is science.\n- A clean station is a clear mind.\n- Never put something in front of someone you wouldn't eat yourself.`
}
// BENCH (not yet active — archetype definitions ready for future slots):
// 'The Original': Self-taught British chef, 3 Michelin stars, walked away at the peak. Calm, philosophical, unhurried.
// 'The Grill': New York-raised, Southwest flavors, fire-obsessed. Energetic, confident, bold.
// 'The Craftsman': American chef, obsessive French discipline, reverent about fundamentals. Measured, precise, thoughtful.

// ─── OFF-TOPIC DEFLECTION POOLS ───
const DEFLECTION_POOLS = {
  'The American in Paris': [
    "Oh my goodness, that's a wonderful thing to wonder about, but right now we've got this on the stove and it needs our attention! Let's save that for after dinner, shall we?",
    "I would love nothing more than to explore that — but the butter is browning and it will not wait! Back to it!",
    "Dearie, what a thought! But the kitchen calls — let's finish this first and then we can chat about anything you like!"
  ],
  'The Classicist': [
    "Perhaps later. For now, this moment — this is what matters.",
    "Another time, yes. But the dish, it will not wait for us.",
    "A good question. But the kitchen demands focus. We continue."
  ],
  'The Maverick': [
    "Not what we're doing right now. Pay attention — this is where people mess it up.",
    "Save it. You've got a cook to finish and it's not going to finish itself.",
    "Great topic. Wrong time. Eyes on the pan."
  ],
  'The Perfectionist': [
    "We'll talk about that later. Right now — eyes on the pan.",
    "Park that thought. This step right here decides whether the dish is good or great.",
    "Focus. That question isn't going anywhere. This sear is."
  ]
}

// ─── SCALE INGREDIENT AMOUNT ───
function scaleAmount(amount, multiplier) {
  if (!amount || multiplier === 1) return amount
  const str = String(amount).trim()
  if (/[a-zA-Z]/.test(str)) return str
  const fracMatch = str.match(/^(\d+)\/(\d+)$/)
  if (fracMatch) {
    const val = (parseInt(fracMatch[1]) / parseInt(fracMatch[2])) * multiplier
    return formatScaledNumber(val)
  }
  const num = parseFloat(str)
  if (isNaN(num)) return str
  return formatScaledNumber(num * multiplier)
}

function formatScaledNumber(n) {
  if (n === Math.floor(n)) return String(n)
  const fracs = [[0.25, '1/4'], [0.33, '1/3'], [0.5, '1/2'], [0.67, '2/3'], [0.75, '3/4']]
  const whole = Math.floor(n)
  const remainder = n - whole
  for (const [val, label] of fracs) {
    if (Math.abs(remainder - val) < 0.05) {
      return whole > 0 ? `${whole} ${label}` : label
    }
  }
  return n.toFixed(1).replace(/\.0$/, '')
}

function buildSystemPrompt(chef, recipe, portions, currentStepNum, substitutions, usedDeflections) {
  const steps = recipe.steps || []
  const currentStepObj = steps.find(s => s.step_number === currentStepNum)
  const nextStepObj = steps.find(s => s.step_number === currentStepNum + 1)

  const baseServings = recipe.servings || 4
  const multiplier = portions / baseServings

  const identity = CHEF_IDENTITIES[chef.name] || `You are ${chef.name}.\n\nPERSONALITY: ${chef.personality_description}\nVOICE STYLE: ${chef.voice_style}`

  let recipeContext = `Recipe: ${recipe.title}\nDifficulty: ${recipe.difficulty}\nTotal time: ${recipe.total_time_minutes} min`
  if (multiplier !== 1) {
    recipeContext += `\nScaled from ${baseServings} to ${portions} servings (${multiplier.toFixed(2)}x multiplier)`
  }
  if (currentStepObj) {
    let stepDesc = `Current step (${currentStepObj.step_number} of ${steps.length}): ${currentStepObj.instruction}`
    if (currentStepObj.duration_minutes > 0) stepDesc += ` [${currentStepObj.duration_minutes} min${currentStepObj.timer_needed ? ', timer recommended' : ''}]`
    if (currentStepObj.technique_notes) stepDesc += `\nTechnique: ${currentStepObj.technique_notes}`
    if (currentStepObj.chef_tip) stepDesc += `\nChef tip: ${currentStepObj.chef_tip}`

    const stepIngredients = (recipe.ingredients || [])
      .filter(i => ingredientMatchesStep(i.item, currentStepObj.instruction || ''))
      .map(i => `${scaleAmount(i.amount, multiplier)} ${i.unit} ${i.item}`)
      .join(', ')
    if (stepIngredients) stepDesc += `\nKey ingredients active at this step: ${stepIngredients}`

    recipeContext += `\n${stepDesc}`
  }
  if (nextStepObj) {
    recipeContext += `\nUpcoming step preview (do not reveal, use only to anticipate anxiety): ${nextStepObj.instruction}`
  }

  const allIngredients = (recipe.ingredients || [])
    .map(i => `${scaleAmount(i.amount, multiplier)} ${i.unit} ${i.item}`)
    .join(', ')
  if (allIngredients) {
    recipeContext += `\nFull ingredient list (scaled for ${portions} servings): ${allIngredients}`
  }

  const subsText = substitutions && substitutions.length > 0
    ? substitutions.join(', ')
    : 'None noted'
  const userContext = `Portions: ${portions} servings${multiplier !== 1 ? ` (scaled from ${baseServings})` : ''}\nNoted substitutions: ${subsText}`

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
- IMPORTANT: Always reference the SCALED ingredient amounts when discussing quantities. The cook is making ${portions} servings, not the base ${baseServings}.

CULINARY KNOWLEDGE:
- When the user asks about technique, science, ingredients, substitutions, or troubleshooting, you may receive CULINARY KNOWLEDGE CONTEXT below. Use it to answer with depth and authority, but in your chef's voice. Do not mention looking anything up.`

  const pool = DEFLECTION_POOLS[chef.name] || []
  const availableDeflections = pool.filter((_, i) => !(usedDeflections || []).includes(i))
  const deflectionList = (availableDeflections.length > 0 ? availableDeflections : pool).map((d, i) => `${i + 1}. "${d}"`).join('\n')
  const offTopicHandling = `If a question is clearly outside cooking, use ONE of these deflections and return immediately to the current step.\n\nDeflection options:\n${deflectionList}`

  const hardLimits = `HARD LIMITS:\n- Cooking and food topics only\n- No medical or dietary advice beyond obvious common sense\n- No nutrition claims\n- No engagement with off-topic questions\n- If asked to break character: stay in character, redirect to the cook`

  return `[CHEF IDENTITY]\n${identity}\n\n[RECIPE CONTEXT]\n${recipeContext}\n\n[USER CONTEXT]\n${userContext}\n\n[CONVERSATION RULES]\n${conversationRules}\n\n[OFF-TOPIC HANDLING]\n${offTopicHandling}\n\n[HARD LIMITS]\n${hardLimits}`
}

function pruneMessages(messages) {
  if (messages.length <= 12) return messages
  return [...messages.slice(0, 2), ...messages.slice(-6)]
}

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

const CACHE_KEY = 'heardchef_session_cache'
function cacheSession(d) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)) } catch { /* ok */ } }
function getCachedSession() { try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : null } catch { return null } }
function clearCachedSession() { try { localStorage.removeItem(CACHE_KEY) } catch { /* ok */ } }

const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const speechSupported = !!SpeechRecognition
const synthSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

class AudioQueue {
  constructor() { this.queue = []; this.playing = false; this.cancelled = false; this.currentAudio = null; this.rate = 1.0; this.onStateChange = null; this.onFinished = null }
  setRate(r) { this.rate = r; if (this.currentAudio) this.currentAudio.playbackRate = r }
  async enqueue(audioBlob) { if (this.cancelled) return; const url = URL.createObjectURL(audioBlob); this.queue.push(url); if (!this.playing) this._playNext() }
  async _playNext() {
    if (this.cancelled || this.queue.length === 0) { this.playing = false; this.currentAudio = null; this.onFinished?.(); return }
    this.playing = true; this.onStateChange?.('chef_speaking'); const url = this.queue.shift(); const audio = new Audio(url); audio.playbackRate = this.rate; this.currentAudio = audio
    return new Promise(resolve => { audio.onended = () => { this.currentAudio = null; URL.revokeObjectURL(url); resolve(); this._playNext() }; audio.onerror = () => { this.currentAudio = null; URL.revokeObjectURL(url); resolve(); this._playNext() }; audio.play().catch(() => { this.currentAudio = null; URL.revokeObjectURL(url); resolve(); this._playNext() }) })
  }
  stop() { this.cancelled = true; for (const url of this.queue) URL.revokeObjectURL(url); this.queue = []; if (this.currentAudio) { this.currentAudio.pause(); this.currentAudio.currentTime = 0; this.currentAudio.src = ''; this.currentAudio = null }; if (synthSupported) window.speechSynthesis.cancel(); this.playing = false }
  reset() { this.cancelled = false; this.queue = []; this.playing = false; this.currentAudio = null }
  get isPlaying() { return this.playing }
}

async function fetchTTSBlob(text, voiceId) { const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice_id: voiceId }) }); if (!res.ok) return null; return await res.blob() }
function fallbackSpeak(text, rate, onDone) { if (!synthSupported) { onDone?.(); return }; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = rate; u.onend = () => onDone?.(); u.onerror = () => onDone?.(); window.speechSynthesis.speak(u) }

class VoiceActivityDetector {
  constructor(onVoiceDetected) { this.onVoiceDetected = onVoiceDetected; this.audioCtx = null; this.analyser = null; this.stream = null; this.rafId = null; this.active = false; this.threshold = 18; this.consecutiveFrames = 0; this.requiredFrames = 2 }
  async start() { if (this.active) return; try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); const source = this.audioCtx.createMediaStreamSource(this.stream); this.analyser = this.audioCtx.createAnalyser(); this.analyser.fftSize = 512; this.analyser.smoothingTimeConstant = 0.3; source.connect(this.analyser); this.active = true; this._poll() } catch { /* ok */ } }
  _poll() { if (!this.active || !this.analyser) return; const data = new Uint8Array(this.analyser.frequencyBinCount); this.analyser.getByteFrequencyData(data); const avg = data.reduce((a, b) => a + b, 0) / data.length; if (avg > this.threshold) { this.consecutiveFrames++; if (this.consecutiveFrames >= this.requiredFrames) { this.consecutiveFrames = 0; this.onVoiceDetected?.() } } else { this.consecutiveFrames = 0 }; this.rafId = requestAnimationFrame(() => this._poll()) }
  stop() { this.active = false; if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null }; if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null }; if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null }; this.analyser = null; this.consecutiveFrames = 0 }
}

// Icons
function MicIcon({ className }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="1" width="6" height="11" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg> }
function SpeakerIcon({ className, on }) { return on ? <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg> : <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg> }
function PauseIcon({ className }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="4" x2="10" y2="20" /><line x1="14" y1="4" x2="14" y2="20" /></svg> }
function PlayIcon({ className }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg> }
function BookIcon({ className }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg> }

export default function CookingSession() {
  const { recipeId } = useParams()
  const [searchParams] = useSearchParams()
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
  const [interrupted, setInterrupted] = useState(false)
  const [viewportHeight, setViewportHeight] = useState(null)
  const [paused, setPaused] = useState(false)
  const [readMode, setReadMode] = useState(false)

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
  const pausedRef = useRef(false)
  const readModeRef = useRef(false)

  voiceModeRef.current = voiceMode
  micMutedRef.current = micMuted
  convStateRef.current = convState
  pausedRef.current = paused
  readModeRef.current = readMode

  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [])
  useEffect(() => { scrollToBottom() }, [messages, streamingText, scrollToBottom])

  useEffect(() => {
    if (!window.visualViewport) return
    const h = () => { setViewportHeight(window.visualViewport.height); scrollToBottom() }
    window.visualViewport.addEventListener('resize', h); window.visualViewport.addEventListener('scroll', h); h()
    return () => { window.visualViewport.removeEventListener('resize', h); window.visualViewport.removeEventListener('scroll', h) }
  }, [scrollToBottom])

  // ─── MIC CONTROL (pause/readMode-aware) ───
  function startMic() {
    if (pausedRef.current || readModeRef.current) return
    if (!speechSupported || !recognitionRef.current || micMutedRef.current || !voiceModeRef.current) return
    if (convStateRef.current === 'chef_speaking') return
    try { recognitionRef.current.start(); setConvState('listening'); convStateRef.current = 'listening' } catch { /* ok */ }
  }
  function stopMic() {
    if (!recognitionRef.current) return
    try { recognitionRef.current.stop() } catch { /* ok */ }
    if (convStateRef.current === 'listening') { setConvState('idle'); convStateRef.current = 'idle' }
  }
  function stopAllAudio() { audioQueueRef.current.stop(); if (synthSupported) window.speechSynthesis.cancel() }

  function handleVoiceInterrupt() {
    if (pausedRef.current || readModeRef.current) return
    if (convStateRef.current !== 'chef_speaking') return
    stopAllAudio(); vadRef.current?.stop(); setConvState('idle'); convStateRef.current = 'idle'
    setInterrupted(true); setTimeout(() => setInterrupted(false), 600)
    if (voiceModeRef.current && !micMutedRef.current) setTimeout(() => startMic(), 50)
  }

  useEffect(() => { vadRef.current = new VoiceActivityDetector(handleVoiceInterrupt); return () => { vadRef.current?.stop() } }, [])

  async function speakSentence(sentence, voiceId) {
    if (pausedRef.current || readModeRef.current) return
    if (!voiceId) return
    const blob = await fetchTTSBlob(sentence, voiceId)
    if (blob && !audioQueueRef.current.cancelled && !pausedRef.current && !readModeRef.current) { await audioQueueRef.current.enqueue(blob) }
  }

  useEffect(() => { return () => { stopAllAudio(); vadRef.current?.stop() } }, [])

  // ─── PAUSE / RESUME ───
  function togglePause() {
    if (paused) {
      setPaused(false); pausedRef.current = false; setConvState('idle'); convStateRef.current = 'idle'
      if (!readModeRef.current) setTimeout(() => sendMessageRef.current?.('__REPEAT__'), 100)
    } else {
      setPaused(true); pausedRef.current = true; stopAllAudio(); stopMic(); vadRef.current?.stop(); setConvState('paused'); convStateRef.current = 'paused'
    }
  }

  // ─── READ MODE TOGGLE ───
  function toggleReadMode() {
    if (readMode) {
      // Read → Voice: re-enable voice, re-read current step
      setReadMode(false); readModeRef.current = false
      setPaused(false); pausedRef.current = false
      setVoiceMode(true); voiceModeRef.current = true
      setConvState('idle'); convStateRef.current = 'idle'
      setTimeout(() => sendMessageRef.current?.('__REPEAT__'), 100)
    } else {
      // Voice → Read: kill everything, land on current step
      setReadMode(true); readModeRef.current = true
      stopAllAudio(); stopMic(); vadRef.current?.stop()
      setPaused(false); pausedRef.current = false
      setConvState('idle'); convStateRef.current = 'idle'
      // Ensure currentStep is at least 1
      if (currentStep < 1) setCurrentStep(1)
    }
  }

  useEffect(() => {
    if (!speechSupported) return
    const recognition = new SpeechRecognition()
    recognition.continuous = false; recognition.interimResults = false; recognition.lang = 'en-US'
    recognition.onresult = (event) => { const transcript = event.results[0]?.[0]?.transcript?.trim(); if (!transcript) return; if (/repeat\s*that|say\s*that\s*again/i.test(transcript)) { sendMessageRef.current?.('__REPEAT__'); return }; sendMessageRef.current?.(transcript) }
    recognition.onend = () => {
      if (pausedRef.current || readModeRef.current) { if (convStateRef.current === 'listening') { setConvState('idle'); convStateRef.current = 'idle' }; return }
      if (voiceModeRef.current && !micMutedRef.current && convStateRef.current !== 'chef_speaking' && convStateRef.current !== 'thinking') {
        setTimeout(() => { if (pausedRef.current || readModeRef.current) return; if (voiceModeRef.current && !micMutedRef.current && convStateRef.current !== 'chef_speaking' && convStateRef.current !== 'thinking') { try { recognition.start(); setConvState('listening'); convStateRef.current = 'listening' } catch { /* ok */ } } else { if (convStateRef.current === 'listening') { setConvState('idle'); convStateRef.current = 'idle' } } }, 150)
      } else { if (convStateRef.current === 'listening') { setConvState('idle'); convStateRef.current = 'idle' } }
    }
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') { setMicPermission('denied'); return }
      if (pausedRef.current || readModeRef.current) return
      if (voiceModeRef.current && !micMutedRef.current && event.error !== 'not-allowed' && convStateRef.current !== 'chef_speaking') {
        setTimeout(() => { if (pausedRef.current || readModeRef.current) return; if (voiceModeRef.current && !micMutedRef.current && convStateRef.current !== 'chef_speaking') { try { recognition.start(); setConvState('listening'); convStateRef.current = 'listening' } catch { /* ok */ } } }, event.error === 'no-speech' ? 300 : 1000)
      }
    }
    recognitionRef.current = recognition
    return () => { try { recognition.abort() } catch { /* ok */ }; recognitionRef.current = null }
  }, [])

  useEffect(() => { if (navigator.permissions) { navigator.permissions.query({ name: 'microphone' }).then(r => { setMicPermission(r.state); r.onchange = () => setMicPermission(r.state) }).catch(() => {}) } }, [])

  useEffect(() => {
    async function acquire() { if ('wakeLock' in navigator) { try { wakeLockRef.current = await navigator.wakeLock.request('screen'); wakeLockRef.current.addEventListener('release', () => { wakeLockRef.current = null }) } catch { /* ok */ } } }
    acquire(); const h = () => { if (document.visibilityState === 'visible' && !wakeLockRef.current) acquire() }; document.addEventListener('visibilitychange', h)
    return () => { document.removeEventListener('visibilitychange', h); if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null } }
  }, [])

  useEffect(() => { const off = () => setIsOffline(true); const on = () => { setIsOffline(false); setPendingMessages(p => { if (p.length > 0) { p.forEach(m => sendMessage(m, true)); return [] } return p }) }; window.addEventListener('offline', off); window.addEventListener('online', on); return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on) } }, [])

  useEffect(() => { if (recipe && messages.length > 0) cacheSession({ recipeId, recipe, chef, messages, currentStep, portions, sessionId, substitutions, usedDeflections }) }, [messages, recipe, chef, currentStep, portions, sessionId, recipeId, substitutions, usedDeflections])
  useEffect(() => { if (!sessionId || messages.length === 0) return; msgCountSinceLastSave.current++; if (msgCountSinceLastSave.current >= 5) { msgCountSinceLastSave.current = 0; supabase.from('cooking_sessions').update({ conversation_history: messages }).eq('id', sessionId).then() } }, [messages, sessionId])
  useEffect(() => { if (sessionEnded || !sessionId) return; const h = (e) => { e.preventDefault(); e.returnValue = '' }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h) }, [sessionEnded, sessionId])

  // Load recipe + chef, read mode/servings from URL
  useEffect(() => {
    async function load() {
      const { data: rd } = await supabase.from('recipes').select('*').eq('id', recipeId).single()
      if (rd) {
        const { data: cd } = await supabase.from('chefs').select('*').eq('id', rd.chef_id).single()
        setChef(cd); chefRef.current = cd; setRecipe(rd)
        const urlServings = parseInt(searchParams.get('servings'))
        setPortions(urlServings > 0 && urlServings <= 12 ? urlServings : rd.servings)
        const urlMode = searchParams.get('mode')
        if (urlMode === 'read') { setReadMode(true); readModeRef.current = true; setVoiceMode(false); voiceModeRef.current = false; setCurrentStep(1) }
      }
      else { const c = getCachedSession(); if (c && c.recipeId === recipeId) { setRecipe(c.recipe); setChef(c.chef); chefRef.current = c.chef; setMessages(c.messages || []); setCurrentStep(c.currentStep || 0); setPortions(c.portions); setSessionId(c.sessionId); setSubstitutions(c.substitutions || []); setUsedDeflections(c.usedDeflections || []) } }
      setLoading(false)
    }
    load()
  }, [recipeId, searchParams])

  async function streamWithTTS(fetchRes, onFullText) {
    const aq = audioQueueRef.current; aq.reset(); aq.setRate(playbackRate)
    aq.onStateChange = (s) => { if (!pausedRef.current && !readModeRef.current) { setConvState(s); convStateRef.current = s } }
    aq.onFinished = () => { vadRef.current?.stop(); if (!pausedRef.current && !readModeRef.current) { setConvState('idle'); convStateRef.current = 'idle'; if (voiceModeRef.current && !micMutedRef.current) setTimeout(() => startMic(), 150) } }
    stopMic(); if (!pausedRef.current && !readModeRef.current) { setConvState('thinking'); convStateRef.current = 'thinking' }
    if (voiceModeRef.current && !pausedRef.current && !readModeRef.current) vadRef.current?.start()
    let fullText = ''; let sentenceBuffer = ''; const voiceId = chefRef.current?.voice_id
    await readStream(fetchRes, (chunk) => {
      if (aq.cancelled) return; fullText += chunk; setStreamingText(fullText)
      if (voiceId && voiceModeRef.current && !pausedRef.current && !readModeRef.current) { sentenceBuffer += chunk; const sentenceMatch = sentenceBuffer.match(/^(.*?[.!?])\s*(.*)$/s); if (sentenceMatch) { const completeSentence = sentenceMatch[1].trim(); sentenceBuffer = sentenceMatch[2]; if (completeSentence.length > 2) speakSentence(completeSentence, voiceId) } }
    })
    if (voiceId && voiceModeRef.current && sentenceBuffer.trim().length > 2 && !aq.cancelled && !pausedRef.current && !readModeRef.current) speakSentence(sentenceBuffer.trim(), voiceId)
    if ((!voiceId || !voiceModeRef.current) && voiceModeRef.current && fullText && !pausedRef.current && !readModeRef.current) {
      setConvState('chef_speaking'); convStateRef.current = 'chef_speaking'
      await new Promise(resolve => fallbackSpeak(fullText, playbackRate, resolve))
      if (!pausedRef.current && !readModeRef.current) { setConvState('idle'); convStateRef.current = 'idle'; if (voiceModeRef.current && !micMutedRef.current) setTimeout(() => startMic(), 400) }
    }
    onFullText(fullText)
  }

  // Create session + initial greeting (skip in read mode)
  useEffect(() => {
    if (!recipe || !chef || sessionId || !portions) return
    if (readModeRef.current) {
      // Read mode: create session row but skip AI greeting
      async function initReadSession() {
        const { data: session } = await supabase.from('cooking_sessions').insert({ recipe_id: recipe.id, portions, conversation_history: [], started_at: new Date().toISOString() }).select('id').single()
        if (session) setSessionId(session.id)
      }
      initReadSession()
      return
    }
    async function initSession() {
      const { data: session } = await supabase.from('cooking_sessions').insert({ recipe_id: recipe.id, portions, conversation_history: [], started_at: new Date().toISOString() }).select('id').single()
      if (session) setSessionId(session.id)
      const system = buildSystemPrompt(chef, recipe, portions, 1, [], [])
      setSending(true); setStreamingText('')
      try {
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system, messages: [{ role: 'user', content: 'I want to cook this recipe. Let\'s get started!' }], stream: true }) })
        if (!res.ok) throw new Error('API error')
        await streamWithTTS(res, (fullText) => { if (fullText) { setStreamingText(''); setMessages([{ role: 'assistant', content: fullText }]); setCurrentStep(1) } })
      } catch { setStreamingText(''); setMessages([{ role: 'assistant', content: 'Having trouble connecting. Please refresh and try again.' }]) }
      setSending(false)
    }
    initSession()
  }, [recipe, chef, sessionId, portions])

  async function sendMessage(text, isRetry = false) {
    if (sending || sessionEnded) return
    if (text === '__REPEAT__') {
      const last = [...messages].reverse().find(m => m.role === 'assistant')
      if (last && voiceMode && chefRef.current?.voice_id && !pausedRef.current && !readModeRef.current) {
        stopMic(); stopAllAudio(); const aq = audioQueueRef.current; aq.reset(); aq.setRate(playbackRate)
        aq.onStateChange = (s) => { setConvState(s); convStateRef.current = s }
        aq.onFinished = () => { setConvState('idle'); convStateRef.current = 'idle'; if (voiceModeRef.current && !micMutedRef.current && !pausedRef.current && !readModeRef.current) setTimeout(() => startMic(), 400) }
        setConvState('chef_speaking'); convStateRef.current = 'chef_speaking'
        if (voiceModeRef.current && !pausedRef.current && !readModeRef.current) vadRef.current?.start()
        const sentences = last.content.match(/[^.!?]+[.!?]+\s*/g) || [last.content]
        for (const s of sentences) { if (aq.cancelled) break; await speakSentence(s.trim(), chefRef.current.voice_id) }
      }
      return
    }
    if (!text.trim()) return
    stopMic(); stopAllAudio(); vadRef.current?.stop()
    if (!pausedRef.current && !readModeRef.current) { setConvState('thinking'); convStateRef.current = 'thinking' }
    if (isOffline && !isRetry) { setMessages(p => [...p, { role: 'user', content: text.trim() }]); setPendingMessages(p => [...p, text.trim()]); setInput(''); return }
    const userMsg = { role: 'user', content: text.trim() }
    if (!isRetry) { setMessages(p => [...p, userMsg]); setInput('') }
    setSending(true); setStreamingText('')
    const lt = text.toLowerCase(); let nextStep = currentStep
    if (lt === 'next step' || lt === 'done' || lt === 'next') { nextStep = Math.min(currentStep + 1, (recipe.steps || []).length); setCurrentStep(nextStep) }
    else if (lt === 'start over') { nextStep = 1; setCurrentStep(1) }
    const subMatch = text.match(/(?:substitut|replac|swap|use|using)\w*\s+(.+?)(?:\s+(?:instead|for|rather)\s|$)/i)
    let currentSubs = substitutions; if (subMatch) { currentSubs = [...substitutions, subMatch[0].trim()]; setSubstitutions(currentSubs) }
    const system = buildSystemPrompt(chef, recipe, portions, nextStep, currentSubs, usedDeflections)
    const cur = isRetry ? messages : [...messages, userMsg]; const prunedCur = pruneMessages(cur)
    const api = [{ role: 'user', content: 'I want to cook this recipe. Let\'s get started!' }, ...prunedCur]
    const nav = ['next', 'next step', 'done', 'start over', 'help', 'ok', 'okay', 'yes', 'no', 'ready', 'got it']; const isQ = !nav.includes(lt) && lt.length > 3
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system, messages: api, stream: true, ...(isQ && { ragQuery: text.trim(), currentStep: nextStep }) }) })
      if (!res.ok) throw new Error('API error')
      await streamWithTTS(res, (fullText) => {
        if (fullText) { setStreamingText(''); setMessages(p => [...p, { role: 'assistant', content: fullText }]); const sm = fullText.match(/[Ss]tep\s+(\d+)/i); if (sm) setCurrentStep(parseInt(sm[1], 10)); const pool = DEFLECTION_POOLS[chef.name] || []; pool.forEach((d, i) => { if (fullText.includes(d.substring(0, 30))) setUsedDeflections(p => p.includes(i) ? p : [...p, i]) }) }
        else { setStreamingText(''); setMessages(p => [...p, { role: 'assistant', content: 'Sorry, I had trouble responding. Could you try again?' }]) }
      })
    } catch { setStreamingText(''); if (!navigator.onLine) { setIsOffline(true); setPendingMessages(p => [...p, text.trim()]); setMessages(p => [...p, { role: 'assistant', content: 'You seem to be offline. Your message is saved and will be sent when you reconnect.' }]) } else setMessages(p => [...p, { role: 'assistant', content: 'Connection error. Please try again.' }]) }
    setSending(false)
  }

  sendMessageRef.current = sendMessage

  async function endSession() {
    stopAllAudio(); stopMic(); vadRef.current?.stop(); setPaused(false); pausedRef.current = false; setConvState('idle'); convStateRef.current = 'idle'
    if (sessionId) await supabase.from('cooking_sessions').update({ completed_at: new Date().toISOString(), conversation_history: messages, portions }).eq('id', sessionId)
    clearCachedSession(); if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null }; setSessionEnded(true)
  }

  function handleSubmit(e) { e.preventDefault(); sendMessage(input) }
  function toggleVoiceMode() {
    const next = !voiceMode; setVoiceMode(next); voiceModeRef.current = next
    if (!next) { stopMic(); stopAllAudio(); vadRef.current?.stop(); setConvState('idle'); convStateRef.current = 'idle' }
    else if (convStateRef.current !== 'chef_speaking' && convStateRef.current !== 'thinking' && !pausedRef.current && !readModeRef.current) startMic()
  }
  function toggleMute() {
    const next = !micMuted; setMicMuted(next); micMutedRef.current = next
    if (next) stopMic()
    else if (convStateRef.current !== 'chef_speaking' && convStateRef.current !== 'thinking' && !pausedRef.current && !readModeRef.current) startMic()
  }

  const speedOptions = [0.75, 1, 1.25, 1.5]

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-amber-gold text-lg">Preparing your kitchen...</div></div>
  if (!recipe || !chef) return <div className="text-center pt-12 text-neutral-400">Recipe not found.</div>

  const steps = recipe.steps || []
  const activeStep = steps.find(s => s.step_number === currentStep) || steps.find(s => s.step_number === 1)
  const baseServings = recipe.servings || 4
  const multiplier = portions / baseServings

  // Pre-compute all scaled ingredients once
  const scaledIngredients = (recipe.ingredients || []).map(i => ({
    ...i,
    scaledAmount: scaleAmount(i.amount, multiplier)
  }))

  // Read Mode: get ingredients relevant to the active step
  const readStepIngredients = activeStep ? scaledIngredients.filter(i => ingredientMatchesStep(i.item, activeStep.instruction || '')) : []

  if (sessionEnded) return (
    <div className="pt-8 text-center">
      <div className="text-5xl mb-4">&#x1F389;</div>
      <h1 className="text-2xl font-bold text-white mb-2">Great cooking!</h1>
      <p className="text-neutral-400 mb-6">Your session has been saved.</p>
      <Link to={`/recipe/${recipe.id}`} className="inline-block bg-amber-gold text-neutral-900 font-semibold py-3 px-8 rounded-xl hover:bg-amber-light transition-colors">Back to Recipe</Link>
    </div>
  )

  const stateLabel = convState === 'paused' ? 'Session Paused' : convState === 'chef_speaking' ? 'Chef is speaking...' : convState === 'listening' ? 'Listening...' : convState === 'thinking' ? 'Thinking...' : null
  const stateColor = convState === 'paused' ? 'text-orange-400' : convState === 'chef_speaking' ? 'text-amber-gold' : convState === 'listening' ? 'text-red-400' : convState === 'thinking' ? 'text-blue-400' : ''

  return (
    <div className="flex flex-col" style={{ height: viewportHeight ? `${viewportHeight - 65}px` : 'calc(100dvh - 65px)' }}>
      {micPermission === 'denied' && !readMode && <div className="bg-red-900/30 border-b border-red-700/30 px-4 py-2 text-center shrink-0"><span className="text-red-400 text-sm">Microphone access denied. Enable in browser settings.</span></div>}
      {isOffline && <div className="bg-amber-gold/20 border-b border-amber-gold/30 px-4 py-2 text-center shrink-0"><span className="text-amber-gold text-sm font-medium">Reconnecting...</span></div>}

      {/* ─── HEADER TOOLBAR ─── */}
      <div className="bg-dark-card border-b border-dark-border px-3 py-2 flex items-center justify-between shrink-0 gap-1">
        {/* Read/Voice mode toggle */}
        <button onClick={toggleReadMode} className={`flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${readMode ? 'bg-blue-500/20 border border-blue-500/50 text-blue-400' : 'bg-amber-gold/20 border border-amber-gold/50 text-amber-gold'}`}>
          {readMode ? <><BookIcon className="w-3.5 h-3.5" /><span>Read</span></> : <><SpeakerIcon className="w-3.5 h-3.5" on={true} /><span>Voice</span></>}
        </button>

        {!readMode && (
          <>
            <button onClick={togglePause} className={`flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${paused ? 'bg-orange-500/20 border border-orange-500/50 text-orange-400' : 'bg-neutral-800 border border-dark-border text-neutral-400 hover:border-neutral-600'}`}>
              {paused ? <><PlayIcon className="w-3.5 h-3.5" /><span>Resume</span></> : <><PauseIcon className="w-3.5 h-3.5" /><span>Pause</span></>}
            </button>
            {voiceMode && speechSupported && (
              <button onClick={toggleMute} className={`flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${micMuted ? 'bg-red-500/20 border border-red-500/50 text-red-400' : 'bg-neutral-800 border border-dark-border text-neutral-400'}`}>
                <MicIcon className="w-3.5 h-3.5" /><span>{micMuted ? 'Muted' : 'Mic On'}</span>
              </button>
            )}
          </>
        )}

        <span className="flex items-center gap-1 text-xs font-medium text-neutral-400 bg-neutral-800 border border-dark-border px-2.5 py-1 rounded-full">
          <span className="text-amber-gold font-semibold">{portions}</span> servings
        </span>

        {!readMode && (
          <div className="flex items-center gap-0.5">
            {speedOptions.map(s => (
              <button key={s} onClick={() => { setPlaybackRate(s); audioQueueRef.current.setRate(s) }}
                className={`min-h-[32px] min-w-[32px] rounded-md text-xs font-medium transition-colors cursor-pointer ${playbackRate === s ? 'bg-amber-gold text-neutral-900' : 'text-neutral-500 hover:text-neutral-300'}`}>{s}x</button>
            ))}
          </div>
        )}
      </div>

      {/* ─── STATUS BANNERS (voice mode only) ─── */}
      {!readMode && paused && (
        <div className="bg-orange-500/15 border-b border-orange-500/30 px-4 py-2.5 text-center shrink-0">
          <span className="text-sm font-semibold text-orange-400 flex items-center justify-center gap-2"><PauseIcon className="w-4 h-4" />Session paused — tap Resume or use buttons below</span>
        </div>
      )}
      {!readMode && interrupted && !paused && (
        <div className="bg-amber-gold/20 border-b border-amber-gold/40 px-4 py-1.5 text-center shrink-0 animate-pulse"><span className="text-xs font-semibold text-amber-gold">Heard you — go ahead</span></div>
      )}
      {!readMode && !interrupted && !paused && stateLabel && convState !== 'paused' && (
        <div className="bg-dark-card/80 border-b border-dark-border px-4 py-1.5 text-center shrink-0">
          <span className={`text-xs font-medium ${stateColor} flex items-center justify-center gap-2`}>
            {convState === 'chef_speaking' && <SpeakerIcon className="w-3.5 h-3.5" on={true} />}
            {convState === 'listening' && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
            {convState === 'thinking' && <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />}
            {stateLabel}
            {convState === 'chef_speaking' && (
              <button onClick={() => { stopAllAudio(); vadRef.current?.stop(); setConvState('idle'); convStateRef.current = 'idle'; if (voiceModeRef.current && !micMutedRef.current && !pausedRef.current) setTimeout(() => startMic(), 150) }}
                className="text-neutral-500 hover:text-white ml-1 cursor-pointer text-sm">skip</button>
            )}
          </span>
        </div>
      )}

      {/* ─── STEP PROGRESS (always visible) ─── */}
      {activeStep && (
        <div className={`bg-dark-card border-b border-dark-border px-4 py-3 shrink-0 ${paused && !readMode ? 'opacity-70' : ''}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-amber-gold font-semibold text-sm">Step {activeStep.step_number} of {steps.length}</span>
            {multiplier !== 1 && <span className="text-xs text-amber-gold/60 font-normal ml-2">| Scaled for {portions} servings</span>}
            {activeStep.duration_minutes > 0 && <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">{activeStep.timer_needed ? '\u23F1\uFE0F' : '\u23F0'} {activeStep.duration_minutes} min</span>}
          </div>
          {!readMode && <p className="text-sm text-neutral-300 leading-relaxed line-clamp-2">{activeStep.instruction}</p>}
          <div className="mt-2 h-1 bg-neutral-800 rounded-full overflow-hidden"><div className="h-full bg-amber-gold rounded-full transition-all duration-500" style={{ width: `${(currentStep / steps.length) * 100}%` }} /></div>
        </div>
      )}

      {/* ─── READ MODE CONTENT ─── */}
      {readMode ? (
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {activeStep && (
            <div className="space-y-5">
              {multiplier !== 1 && <div className="text-xs text-amber-gold/70 font-medium mb-2">Scaled for {portions} servings (base: {baseServings})</div>}
              <p className="text-[18px] leading-relaxed text-neutral-200">{activeStep.instruction}</p>

              {readStepIngredients.length > 0 && (
                <div className="bg-neutral-800/50 border border-dark-border rounded-xl p-4">
                  <h4 className="text-amber-gold font-semibold text-sm mb-2">Ingredients for this step{multiplier !== 1 && <span className="text-neutral-500 font-normal ml-2">(scaled for {portions} servings)</span>}</h4>
                  <ul className="space-y-1.5">
                    {readStepIngredients.map((ing, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-gold mt-1.5 shrink-0" />
                        <span>{ing.scaledAmount} {ing.unit} {ing.item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeStep.technique_notes && (
                <div className="bg-neutral-800/50 border-l-2 border-amber-gold/40 px-4 py-3 rounded-r-lg">
                  <p className="text-sm text-neutral-400"><span className="text-amber-gold font-semibold">Technique:</span> {activeStep.technique_notes}</p>
                </div>
              )}

{activeStep.chef_tip && (
                <div className="bg-amber-gold/5 border-l-2 border-amber-gold px-4 py-3 rounded-r-lg">
                  <p className="text-sm text-amber-light"><span className="font-semibold">Chef&apos;s Tip:</span> {activeStep.chef_tip}</p>
                </div>
              )}

              {/* Full scaled ingredient list */}
              <details className="mt-4">
                <summary className="text-sm text-neutral-500 cursor-pointer hover:text-neutral-300 transition-colors">
                  View all ingredients{multiplier !== 1 ? ` (scaled for ${portions} servings)` : ""}
                </summary>
                <ul className="mt-2 space-y-1.5 pl-1">
                  {scaledIngredients.map((ing, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-neutral-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 mt-1.5 shrink-0" />
                      <span>{ing.scaledAmount} {ing.unit} {ing.item}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </div>
      ) : (
        /* ─── VOICE MODE CHAT ─── */
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" aria-live="polite">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-amber-gold text-neutral-900' : 'bg-dark-card border border-dark-border text-neutral-200'}`}>
                <p className="text-[16px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {streamingText && (<div className="flex justify-start"><div className="max-w-[85%] rounded-2xl px-4 py-3 bg-dark-card border border-dark-border text-neutral-200"><p className="text-[16px] leading-relaxed whitespace-pre-wrap">{streamingText}</p></div></div>)}
          {sending && !streamingText && (<div className="flex justify-start"><div className="bg-dark-card border border-dark-border rounded-2xl px-4 py-3"><div className="flex gap-1"><span className="w-2 h-2 bg-amber-gold/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-2 h-2 bg-amber-gold/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-2 h-2 bg-amber-gold/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div></div></div>)}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* ─── BOTTOM BUTTONS ─── */}
      {readMode ? (
        <div className="px-4 py-3 flex gap-3 shrink-0 border-t border-dark-border">
          <button
            onClick={() => setCurrentStep(s => Math.max(1, s - 1))}
            disabled={currentStep <= 1}
            className="flex-1 min-h-[48px] bg-dark-card border border-dark-border text-neutral-300 font-medium rounded-xl hover:border-amber-gold/50 hover:text-amber-gold transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95"
          >
            Prev Step
          </button>
          <button
            onClick={() => setCurrentStep(s => Math.min(steps.length, s + 1))}
            disabled={currentStep >= steps.length}
            className="flex-1 min-h-[48px] bg-amber-gold text-neutral-900 font-semibold rounded-xl hover:bg-amber-light transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95"
          >
            Next Step
          </button>
          <button onClick={endSession} className="min-h-[48px] min-w-[48px] bg-red-900/30 border border-red-700/40 text-red-400 font-medium px-5 rounded-xl hover:border-red-500/50 transition-colors cursor-pointer active:scale-95">
            End
          </button>
        </div>
      ) : (
        <>
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
                placeholder={paused ? 'Session paused — tap Resume or use buttons' : voiceMode ? (convState === 'listening' ? 'Listening... or type here' : 'Type here or just speak...') : 'Ask your sous chef anything...'}
                disabled={sending}
                className="flex-1 min-h-[48px] bg-dark-card border border-dark-border rounded-xl px-4 py-3 text-[16px] text-white placeholder-neutral-600 focus:outline-none focus:border-amber-gold/50 disabled:opacity-50" />
              <button type="submit" disabled={sending || !input.trim()}
                className="min-h-[48px] min-w-[48px] bg-amber-gold text-neutral-900 font-semibold px-5 py-3 rounded-xl hover:bg-amber-light transition-colors disabled:opacity-50 cursor-pointer active:scale-95">Send</button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
