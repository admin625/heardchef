import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://mtjqsjpgwiaacybyklkt.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const N8N_WEBHOOK = 'https://jmac.app.n8n.cloud/webhook/heardchef-shopping-list'

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { phoneNumber, recipeName, ingredients, portions, userId, recipeId } = body

  if (!phoneNumber || !recipeName || !ingredients) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: phoneNumber, recipeName, ingredients' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Forward to n8n webhook
    const n8nResponse = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, recipeName, ingredients, portions, userId, recipeId }),
    })

    if (!n8nResponse.ok) {
      const errText = await n8nResponse.text()
      console.error('n8n webhook error:', n8nResponse.status, errText)
      return new Response(
        JSON.stringify({ error: 'Failed to send shopping list', details: errText }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const result = await n8nResponse.json()

    // Persist phone number to hc_users
    if (SUPABASE_KEY && phoneNumber) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

      if (userId) {
        // Update existing user's phone
        await supabase.from('hc_users').update({ phone: phoneNumber }).eq('id', userId)
      } else {
        // Upsert by phone — create user if not found
        const { data: existing } = await supabase
          .from('hc_users')
          .select('id')
          .eq('phone', phoneNumber)
          .maybeSingle()

        if (!existing) {
          const { data: newUser } = await supabase
            .from('hc_users')
            .insert({ phone: phoneNumber })
            .select('id')
            .single()

          if (newUser) {
            result.userId = newUser.id
          }
        } else {
          result.userId = existing.id
        }
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-shopping-list error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to send shopping list', details: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config = {
  path: '/api/send-shopping-list',
}
