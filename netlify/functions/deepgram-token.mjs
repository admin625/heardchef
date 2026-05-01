const DEEPGRAM_GRANT_URL = 'https://api.deepgram.com/v1/auth/grant'
const TTL_SECONDS = 30

// TODO: production hardening — before exposing this beyond /spike/, add either
// an origin/referrer allowlist (heardchef-app.netlify.app + preview branches)
// or a session-based gate tied to an authenticated cooking session. As-is,
// anyone who knows the URL can mint a 30s STT token. Acceptable for spike
// traffic; not acceptable when Path B graduates to production.

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'DEEPGRAM_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const upstream = await fetch(DEEPGRAM_GRANT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: TTL_SECONDS }),
    })

    if (!upstream.ok) {
      const errText = await upstream.text()
      console.error('Deepgram grant error:', upstream.status, errText)
      return new Response(
        JSON.stringify({ error: `Deepgram grant error: ${upstream.status}`, details: errText }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const data = await upstream.json()
    const body = { access_token: data.access_token, expires_in: data.expires_in }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('Deepgram token vending error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to vend Deepgram token', details: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config = {
  path: '/api/deepgram-token',
}
