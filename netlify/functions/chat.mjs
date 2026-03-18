import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://mtjqsjpgwiaacybyklkt.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

async function getEmbedding(text) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: text,
      }),
    })
    const data = await res.json()
    return data.data?.[0]?.embedding || null
  } catch {
    return null
  }
}

async function queryKnowledgeBase(queryText) {
  if (!SUPABASE_KEY) return []

  const embedding = await getEmbedding(queryText)
  if (!embedding) return []

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data, error } = await supabase.rpc('match_culinary_knowledge', {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: 3,
  })

  if (error || !data) return []
  return data
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { system, messages, ragQuery, currentStep, stream } = await req.json()

  if (!system || !messages?.length) {
    return new Response(JSON.stringify({ error: 'Missing system or messages' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Build the system prompt, optionally with RAG context
  let fullSystem = system

  if (ragQuery) {
    const knowledgeChunks = await queryKnowledgeBase(ragQuery)
    if (knowledgeChunks.length > 0) {
      const contextBlock = knowledgeChunks
        .map(
          (chunk) =>
            `[${chunk.source_table}: ${chunk.title}]\n${chunk.content}`
        )
        .join('\n\n---\n\n')

      fullSystem += `\n\nCULINARY KNOWLEDGE CONTEXT (use to inform your answer, do not quote directly or mention looking anything up):\n${contextBlock}`
    }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: fullSystem,
        messages,
        ...(stream && { stream: true }),
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return new Response(JSON.stringify({ error: `Claude API error: ${response.status}`, details: errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Streaming mode: pipe SSE directly to client
    if (stream) {
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // Non-streaming fallback
    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    return new Response(JSON.stringify({ reply: text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to call Claude API', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const config = {
  path: '/api/chat',
}
