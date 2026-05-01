(() => {
  'use strict'

  const SPIKE_VERSION = '0.1.0'
  const DG_LISTEN_BASE = 'wss://api.deepgram.com/v1/listen'
  const DG_PARAMS = {
    model: 'nova-3',
    language: 'en-US',
    smart_format: 'true',
    interim_results: 'true',
    endpointing: '300',
    utterance_end_ms: '1000',
    vad_events: 'true',
    channels: '1',
  }
  const MIME_PRIORITY = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  const CHUNK_TIMESLICE_MS = 250
  const KEEPALIVE_INTERVAL_MS = 8000
  const SYSTEM_PROMPT = "You are a friendly, knowledgeable home chef helping someone cook. Reply in 1-2 short sentences. Be warm and direct. Don't ramble. This is a voice conversation, so keep it natural for spoken English."

  const $ = (id) => document.getElementById(id)
  const log = $('log')
  const interimEl = $('interim')
  const finalsEl = $('finals')
  const chatEl = $('chatArea')

  const state = {
    stream: null,
    recorder: null,
    ws: null,
    keepaliveId: null,
    chunks: 0,
    bytes: 0,
    reconnects: 0,
    lastChunkTs: 0,
    pendingFinals: [],
    completedFinals: [],
    latencies: [],
    autoLoop: false,
    wakeLock: null,
    audioCtx: null,
    audioQueue: [],
    audioPlaying: false,
    chatInFlight: false,
    chosenMime: null,
    fatalDuringStreaming: false,
  }

  function logLine(msg, kind) {
    const ts = new Date().toISOString().slice(11, 23)
    const line = document.createElement('span')
    line.className = 'log-line' + (kind ? ' ' + kind : '')
    line.textContent = `[${ts}] ${msg}`
    log.appendChild(line)
    log.scrollTop = log.scrollHeight
    if (kind === 'error') console.error(msg)
    else if (kind === 'warn') console.warn(msg)
    else console.log(msg)
  }

  function pill(el, label, kind) {
    el.innerHTML = `<span class="pill ${kind}">${label}</span>`
  }

  function setStatus(id, val) { $(id).textContent = val }

  function probe() {
    const dl = $('probe')
    const items = []
    items.push(['Spike version', SPIKE_VERSION])
    items.push(['User agent', navigator.userAgent])
    items.push(['Standalone (iOS PWA)', String(window.navigator.standalone === true)])
    items.push(['Display mode', window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'])
    items.push(['MediaRecorder available', String('MediaRecorder' in window)])
    items.push(['getUserMedia available', String(!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia))])
    items.push(['WebSocket available', String('WebSocket' in window)])
    items.push(['Permissions API', String(!!(navigator.permissions && navigator.permissions.query))])
    items.push(['Wake Lock API', String('wakeLock' in navigator)])
    items.push(['AudioContext', String('AudioContext' in window || 'webkitAudioContext' in window)])
    if ('MediaRecorder' in window) {
      for (const m of MIME_PRIORITY) {
        items.push([`isTypeSupported(${m})`, String(MediaRecorder.isTypeSupported(m))])
      }
    }
    dl.innerHTML = items.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')
    logLine(`Capability probe complete. Standalone=${window.navigator.standalone === true}, MediaRecorder=${'MediaRecorder' in window}`, 'event')
  }

  function pickMime() {
    if (!('MediaRecorder' in window)) return null
    for (const m of MIME_PRIORITY) {
      if (MediaRecorder.isTypeSupported(m)) return m
    }
    return ''
  }

  async function fetchToken() {
    const t0 = performance.now()
    const res = await fetch('/api/deepgram-token', { method: 'POST' })
    const dt = (performance.now() - t0).toFixed(0)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logLine(`Token fetch failed in ${dt}ms: ${res.status} ${body}`, 'error')
      throw new Error(`token ${res.status}`)
    }
    const data = await res.json()
    logLine(`Token fetched in ${dt}ms (expires_in=${data.expires_in})`, 'event')
    return data.access_token
  }

  function buildWsUrl() {
    const params = new URLSearchParams(DG_PARAMS)
    return `${DG_LISTEN_BASE}?${params.toString()}`
  }

  function openWs(token) {
    return new Promise((resolve, reject) => {
      const url = buildWsUrl()
      logLine(`Opening WS: ${url}`, 'event')
      const ws = new WebSocket(url, ['token', token])
      ws.binaryType = 'arraybuffer'
      const openTimer = setTimeout(() => { ws.close(); reject(new Error('ws open timeout')) }, 8000)
      ws.addEventListener('open', () => {
        clearTimeout(openTimer)
        pill($('stWS'), 'open', 'ok')
        logLine('WS open', 'event')
        state.keepaliveId = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'KeepAlive' })) } catch (e) { logLine('keepalive send failed: ' + e.message, 'warn') }
          }
        }, KEEPALIVE_INTERVAL_MS)
        resolve(ws)
      })
      ws.addEventListener('error', (ev) => {
        logLine('WS error event', 'error')
      })
      ws.addEventListener('close', (ev) => {
        clearTimeout(openTimer)
        if (state.keepaliveId) { clearInterval(state.keepaliveId); state.keepaliveId = null }
        pill($('stWS'), 'closed', 'idle')
        logLine(`WS closed code=${ev.code} reason="${ev.reason || ''}" wasClean=${ev.wasClean}`, ev.wasClean ? 'event' : 'warn')
        if (state.recorder && state.recorder.state !== 'inactive') {
          state.fatalDuringStreaming = true
          logLine('WS closed while recorder active — STT broken until restart', 'error')
        }
      })
      ws.addEventListener('message', onWsMessage)
    })
  }

  function onWsMessage(ev) {
    if (typeof ev.data !== 'string') return
    let msg
    try { msg = JSON.parse(ev.data) } catch { return }
    if (msg.type === 'Results') {
      const alt = msg.channel?.alternatives?.[0]
      const transcript = (alt?.transcript || '').trim()
      if (!transcript && !msg.is_final) {
        interimEl.textContent = ''
        return
      }
      if (msg.is_final) {
        if (transcript) {
          state.pendingFinals.push(transcript)
          logLine(`final: "${transcript}"${msg.speech_final ? ' [speech_final]' : ''}`, 'event')
          if (state.lastChunkTs) {
            const lat = performance.now() - state.lastChunkTs
            state.latencies.push(lat)
            $('stLatency').textContent = `${lat.toFixed(0)}ms`
            updateLatencyAgg()
          }
        }
        interimEl.textContent = ''
        if (msg.speech_final) {
          flushUtterance()
        }
      } else {
        interimEl.textContent = ' ' + transcript
      }
    } else if (msg.type === 'UtteranceEnd') {
      logLine(`UtteranceEnd channel=${msg.channel?.[0]} last_word_end=${msg.last_word_end}`, 'event')
      flushUtterance()
    } else if (msg.type === 'SpeechStarted') {
      logLine(`SpeechStarted timestamp=${msg.timestamp}`, 'event')
    } else if (msg.type === 'Metadata') {
      logLine(`Metadata request_id=${msg.request_id} model=${msg.model_info?.name || '?'}`, 'event')
    }
  }

  function updateLatencyAgg() {
    if (state.latencies.length === 0) return
    const sorted = [...state.latencies].sort((a, b) => a - b)
    const p50 = sorted[Math.floor(sorted.length * 0.5)]
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1]
    $('stLatencyAgg').textContent = `${p50.toFixed(0)}ms / ${p95.toFixed(0)}ms (n=${state.latencies.length})`
  }

  function flushUtterance() {
    if (state.pendingFinals.length === 0) return
    const utterance = state.pendingFinals.join(' ').trim()
    state.pendingFinals = []
    state.completedFinals.push(utterance)
    finalsEl.textContent = (finalsEl.textContent + ' ' + utterance).trim() + ' '
    $('sendChatBtn').disabled = false
    if (state.autoLoop && !state.chatInFlight) {
      sendToChat(utterance)
    }
  }

  async function startSTT() {
    if (state.recorder) { logLine('already running', 'warn'); return }
    state.fatalDuringStreaming = false
    pill($('stSTT'), 'requesting mic', 'active')
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      pill($('stSTT'), 'mic denied', 'bad')
      logLine(`getUserMedia failed: ${err.name} ${err.message}`, 'error')
      return
    }
    logLine('mic granted', 'event')
    const mime = pickMime()
    state.chosenMime = mime === '' ? '(default)' : (mime || 'NONE')
    setStatus('stMime', state.chosenMime)
    if (mime === null) {
      logLine('MediaRecorder not available — spike cannot proceed on this browser', 'error')
      pill($('stSTT'), 'unsupported', 'bad')
      return
    }
    let token
    try { token = await fetchToken() } catch { pill($('stSTT'), 'token failed', 'bad'); cleanupStream(); return }
    let ws
    try { ws = await openWs(token) } catch (e) { logLine(`WS open failed: ${e.message}`, 'error'); pill($('stSTT'), 'ws failed', 'bad'); cleanupStream(); return }
    state.ws = ws
    let recorder
    try {
      recorder = mime === '' ? new MediaRecorder(state.stream) : new MediaRecorder(state.stream, { mimeType: mime })
    } catch (e) {
      logLine(`MediaRecorder construct failed: ${e.message}`, 'error')
      pill($('stSTT'), 'recorder failed', 'bad')
      try { ws.close() } catch {}
      cleanupStream()
      return
    }
    state.recorder = recorder
    logLine(`recorder constructed, mimeType=${recorder.mimeType}`, 'event')
    setStatus('stMime', recorder.mimeType || state.chosenMime)
    recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(e.data)
        state.chunks++
        state.bytes += e.data.size
        state.lastChunkTs = performance.now()
        $('stChunks').textContent = String(state.chunks)
        $('stBytes').textContent = String(state.bytes)
      }
    }
    recorder.onerror = (ev) => logLine(`recorder error: ${ev.error?.name || 'unknown'} ${ev.error?.message || ''}`, 'error')
    recorder.onstop = () => logLine('recorder stopped', 'event')
    try {
      recorder.start(CHUNK_TIMESLICE_MS)
    } catch (e) {
      logLine(`recorder.start failed: ${e.message}`, 'error')
      pill($('stSTT'), 'start failed', 'bad')
      try { ws.close() } catch {}
      cleanupStream()
      return
    }
    pill($('stSTT'), 'streaming', 'ok')
    $('startBtn').disabled = true
    $('stopBtn').disabled = false
  }

  function cleanupStream() {
    if (state.stream) {
      state.stream.getTracks().forEach(t => t.stop())
      state.stream = null
    }
  }

  function stopSTT() {
    logLine('stopSTT requested', 'event')
    if (state.recorder) {
      try { state.recorder.stop() } catch {}
      state.recorder = null
    }
    if (state.ws) {
      try {
        if (state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify({ type: 'CloseStream' }))
      } catch {}
      try { state.ws.close() } catch {}
      state.ws = null
    }
    if (state.keepaliveId) { clearInterval(state.keepaliveId); state.keepaliveId = null }
    cleanupStream()
    pill($('stSTT'), 'idle', 'idle')
    $('startBtn').disabled = false
    $('stopBtn').disabled = true
  }

  async function sendToChat(text) {
    if (state.chatInFlight) { logLine('chat in flight; skipping', 'warn'); return }
    state.chatInFlight = true
    chatEl.textContent = ''
    const t0 = performance.now()
    let firstChunkAt = null
    let fullText = ''
    let sentenceBuf = ''
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: text }],
          stream: true,
        }),
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        logLine(`chat ${res.status} ${errBody}`, 'error')
        chatEl.textContent = `[chat error ${res.status}]`
        return
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (firstChunkAt === null) {
          firstChunkAt = performance.now()
          logLine(`chat first byte ${(firstChunkAt - t0).toFixed(0)}ms`, 'event')
        }
        buffer += dec.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6).trim()
          if (!json) continue
          let evt
          try { evt = JSON.parse(json) } catch { continue }
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            const txt = evt.delta.text || ''
            fullText += txt
            chatEl.textContent = fullText
            sentenceBuf += txt
            const m = sentenceBuf.match(/^(.*?[.!?])\s*([\s\S]*)$/)
            if (m) {
              const sentence = m[1].trim()
              sentenceBuf = m[2]
              if (sentence.length > 2) speakSentence(sentence)
            }
          }
        }
      }
      if (sentenceBuf.trim().length > 2) speakSentence(sentenceBuf.trim())
      logLine(`chat done ${(performance.now() - t0).toFixed(0)}ms total ${fullText.length} chars`, 'event')
    } catch (err) {
      logLine(`chat failed: ${err.message}`, 'error')
      chatEl.textContent = `[chat error: ${err.message}]`
    } finally {
      state.chatInFlight = false
      if (state.autoLoop) {
        waitForAudioDrain().then(() => {
          if (state.autoLoop && !state.recorder) startSTT()
        })
      }
    }
  }

  async function speakSentence(sentence) {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence, voice_id: '21m00Tcm4TlvDq8ikWAM' }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        logLine(`tts ${res.status} ${body.slice(0, 200)}`, 'error')
        return
      }
      const blob = await res.blob()
      enqueueAudio(blob)
    } catch (err) {
      logLine(`tts failed: ${err.message}`, 'error')
    }
  }

  function enqueueAudio(blob) {
    state.audioQueue.push(URL.createObjectURL(blob))
    if (!state.audioPlaying) playNextAudio()
  }

  async function playNextAudio() {
    if (state.audioQueue.length === 0) { state.audioPlaying = false; return }
    state.audioPlaying = true
    const url = state.audioQueue.shift()
    const audio = new Audio(url)
    await new Promise((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(url); resolve() }
      audio.onerror = () => { logLine('audio element error', 'error'); URL.revokeObjectURL(url); resolve() }
      audio.play().catch((err) => { logLine(`audio.play rejected: ${err.message}`, 'error'); resolve() })
    })
    playNextAudio()
  }

  function waitForAudioDrain() {
    return new Promise((resolve) => {
      const check = () => {
        if (!state.audioPlaying && state.audioQueue.length === 0) resolve()
        else setTimeout(check, 200)
      }
      check()
    })
  }

  async function toggleWakeLock(on) {
    if (on) {
      if (!('wakeLock' in navigator)) { logLine('wakeLock unsupported on this browser', 'warn'); $('wakeLockToggle').checked = false; return }
      try {
        state.wakeLock = await navigator.wakeLock.request('screen')
        pill($('stWake'), 'on', 'ok')
        logLine('wake lock acquired', 'event')
        state.wakeLock.addEventListener('release', () => {
          pill($('stWake'), 'released', 'idle')
          logLine('wake lock released by system', 'warn')
          state.wakeLock = null
          $('wakeLockToggle').checked = false
        })
      } catch (err) {
        logLine(`wakeLock.request failed: ${err.name} ${err.message}`, 'error')
        $('wakeLockToggle').checked = false
      }
    } else {
      if (state.wakeLock) { try { await state.wakeLock.release() } catch {} state.wakeLock = null }
      pill($('stWake'), 'off', 'idle')
    }
  }

  document.addEventListener('visibilitychange', () => {
    const v = document.visibilityState
    pill($('stVis'), v, v === 'visible' ? 'ok' : 'bad')
    logLine(`visibility -> ${v}`, 'event')
    if (v === 'visible' && $('wakeLockToggle').checked && !state.wakeLock) {
      toggleWakeLock(true)
    }
  })

  $('gateBtn').addEventListener('click', () => {
    $('gate').classList.add('hidden')
    $('main').classList.remove('hidden')
    probe()
    $('startBtn').disabled = false
    logLine('spike entered', 'event')
  })
  $('startBtn').addEventListener('click', startSTT)
  $('stopBtn').addEventListener('click', stopSTT)
  $('sendChatBtn').addEventListener('click', () => {
    const last = state.completedFinals[state.completedFinals.length - 1]
    if (!last) { logLine('no final transcript to send', 'warn'); return }
    sendToChat(last)
  })
  $('ttsTestBtn').addEventListener('click', () => speakSentence('Hello from the spike. This is a test of the text to speech path.'))
  $('autoLoop').addEventListener('change', (e) => {
    state.autoLoop = e.target.checked
    logLine(`auto-loop ${state.autoLoop ? 'on' : 'off'}`, 'event')
  })
  $('wakeLockToggle').addEventListener('change', (e) => toggleWakeLock(e.target.checked))
  $('copyLogBtn').addEventListener('click', async () => {
    const text = log.innerText
    try {
      await navigator.clipboard.writeText(text)
      logLine('log copied to clipboard', 'event')
    } catch (err) {
      logLine(`clipboard failed: ${err.message}`, 'warn')
    }
  })
  $('clearLogBtn').addEventListener('click', () => { log.innerHTML = '' })

  window.addEventListener('error', (e) => logLine(`window.error: ${e.message} @ ${e.filename}:${e.lineno}`, 'error'))
  window.addEventListener('unhandledrejection', (e) => logLine(`unhandled rejection: ${e.reason?.message || e.reason}`, 'error'))
})()
