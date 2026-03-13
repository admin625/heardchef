import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function buildSystemPrompt(chef, recipe, portions) {
  const ingredientsList = (recipe.ingredients || [])
    .map(i => `- ${i.amount} ${i.unit} ${i.item}${i.substitutions?.length ? ` (subs: ${i.substitutions.join(', ')})` : ''}`)
    .join('\n')

  const stepsList = (recipe.steps || [])
    .map(s => {
      let line = `Step ${s.step_number}: ${s.instruction}`
      if (s.duration_minutes > 0) line += ` [${s.duration_minutes} min${s.timer_needed ? ', timer recommended' : ''}]`
      if (s.technique_notes) line += `\nTechnique: ${s.technique_notes}`
      if (s.chef_tip) line += `\nChef tip: ${s.chef_tip}`
      return line
    })
    .join('\n\n')

  return `You are a sous chef AI assistant guiding someone through cooking a recipe. You embody the personality and voice of ${chef.name}.

PERSONALITY: ${chef.personality_description}

VOICE STYLE: ${chef.voice_style}

RECIPE: ${recipe.title}
Difficulty: ${recipe.difficulty}
Original servings: ${recipe.servings}
Current portions: ${portions}
Prep time: ${recipe.prep_time_minutes} min | Cook time: ${recipe.cook_time_minutes} min | Total: ${recipe.total_time_minutes} min

INGREDIENTS (for ${recipe.servings} servings \u2014 scale to ${portions} if different):
${ingredientsList}

STEPS:
${stepsList}

${recipe.chef_notes ? `CHEF NOTES: ${recipe.chef_notes}` : ''}
${recipe.wine_pairing ? `WINE PAIRING: ${recipe.wine_pairing}` : ''}

CONVERSATION RULES:
1. Keep messages SHORT \u2014 2-3 sentences max. One idea at a time.
2. Walk through steps ONE AT A TIME. Never dump multiple steps.
3. After explaining a step, confirm the cook understands before moving on.
4. When a step has a duration, proactively mention setting a timer: \"Set a timer for X minutes.\"
5. If the cook asks about substitutions, use the substitution data from ingredients when available. If not listed, suggest reasonable alternatives.
6. If the cook asks to scale portions, recalculate ingredient amounts proportionally and mention the key changes.
7. Track which step the cook is on. If they say \"next\" or \"done\", advance to the next step.
8. If they say \"help\" or seem confused, re-explain the current step more simply.
9. If they say \"start over\", go back to step 1.
10. Stay in character as ${chef.name} throughout \u2014 use their speech patterns and catchphrases naturally, not forced.
11. Never overwhelm. Be encouraging. Cooking should be fun.
12. Start by greeting the cook in character, confirming the recipe and portions, and asking if they're ready to begin with step 1.`
}

export default function CookingSession() {
  const { recipeId } = useParams()
  const [recipe, setRecipe] = useState(null)
  const [chef, setChef] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [portions, setPortions] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // Load recipe + chef
  useEffect(() => {
    async function load() {
      const { data: recipeData } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', recipeId)
        .single()

      if (recipeData) {
        const { data: chefData } = await supabase
          .from('chefs')
          .select('*')
          .eq('id', recipeData.chef_id)
          .single()
        setChef(chefData)
        setPortions(recipeData.servings)
      }
      setRecipe(recipeData)
      setLoading(false)
    }
    load()
  }, [recipeId])

  // Create session + send initial greeting
  useEffect(() => {
    if (!recipe || !chef || sessionId) return

    async function initSession() {
      // Create cooking session
      const { data: session } = await supabase
        .from('cooking_sessions')
        .insert({
          recipe_id: recipe.id,
          portions: recipe.servings,
          conversation_history: [],
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (session) setSessionId(session.id)

      // Send initial greeting
      const system = buildSystemPrompt(chef, recipe, recipe.servings)
      const initMessages = [{ role: 'user', content: 'I want to cook this recipe. Let\'s get started!' }]

      setSending(true)
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system, messages: initMessages }),
        })
        const data = await res.json()
        if (data.reply) {
          setMessages([{ role: 'assistant', content: data.reply }])
          setCurrentStep(1)
        }
      } catch {
        setMessages([{ role: 'assistant', content: 'Having trouble connecting. Please refresh and try again.' }])
      }
      setSending(false)
    }
    initSession()
  }, [recipe, chef, sessionId])

  // Save conversation to Supabase on every message update
  useEffect(() => {
    if (!sessionId || messages.length === 0) return
    supabase
      .from('cooking_sessions')
      .update({ conversation_history: messages })
      .eq('id', sessionId)
      .then()
  }, [messages, sessionId])

  async function sendMessage(text) {
    if (!text.trim() || sending || sessionEnded) return

    const userMsg = { role: 'user', content: text.trim() }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput('')
    setSending(true)

    // Detect step tracking from user input
    const lowerText = text.toLowerCase()
    if (lowerText === 'next step' || lowerText === 'done' || lowerText === 'next') {
      setCurrentStep(prev => Math.min(prev + 1, (recipe.steps || []).length))
    } else if (lowerText === 'start over') {
      setCurrentStep(1)
    }

    const system = buildSystemPrompt(chef, recipe, portions)
    // Build API messages: initial hidden user msg + visible conversation
    const apiMessages = [
      { role: 'user', content: 'I want to cook this recipe. Let\'s get started!' },
      ...updated,
    ]

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, messages: apiMessages }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])

        // Try to detect step number from AI response
        const stepMatch = data.reply.match(/[Ss]tep\s+(\d+)/i)
        if (stepMatch) {
          setCurrentStep(parseInt(stepMatch[1], 10))
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble responding. Could you try again?' }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }])
    }
    setSending(false)
    inputRef.current?.focus()
  }

  async function endSession() {
    if (sessionId) {
      await supabase
        .from('cooking_sessions')
        .update({
          completed_at: new Date().toISOString(),
          conversation_history: messages,
        })
        .eq('id', sessionId)
    }
    setSessionEnded(true)
  }

  function handleQuickReply(text) {
    sendMessage(text)
  }

  function handleSubmit(e) {
    e.preventDefault()
    sendMessage(input)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-amber-gold text-lg">Preparing your kitchen...</div>
      </div>
    )
  }

  if (!recipe || !chef) {
    return <div className="text-center pt-12 text-neutral-400">Recipe not found.</div>
  }

  const steps = recipe.steps || []
  const activeStep = steps.find(s => s.step_number === currentStep)

  if (sessionEnded) {
    return (
      <div className="pt-8 text-center">
        <div className="text-5xl mb-4">\uD83C\uDF89</div>
        <h1 className="text-2xl font-bold text-white mb-2">Great cooking!</h1>
        <p className="text-neutral-400 mb-6">Your session has been saved.</p>
        <Link
          to={`/recipe/${recipe.id}`}
          className="inline-block bg-amber-gold text-neutral-900 font-semibold py-3 px-8 rounded-xl hover:bg-amber-light transition-colors"
        >
          Back to Recipe
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-65px)]">
      {/* Current Step Banner */}
      {activeStep && (
        <div className="bg-dark-card border-b border-dark-border px-4 py-3 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-amber-gold font-semibold text-sm">
              Step {activeStep.step_number} of {steps.length}
            </span>
            {activeStep.duration_minutes > 0 && (
              <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">
                {activeStep.timer_needed ? '\u23F1\uFE0F' : '\u23F0'} {activeStep.duration_minutes} min
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed line-clamp-2">
            {activeStep.instruction}
          </p>
          {/* Step progress bar */}
          <div className="mt-2 h-1 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-gold rounded-full transition-all duration-500"
              style={{ width: `${(currentStep / steps.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-amber-gold text-neutral-900'
                  : 'bg-dark-card border border-dark-border text-neutral-200'
              }`}
            >
              <p className="text-[16px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-dark-card border border-dark-border rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-amber-gold/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-amber-gold/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-amber-gold/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      <div className="px-4 py-2 flex gap-2 overflow-x-auto shrink-0">
        {['Done', 'Next Step', 'Help', 'Start Over'].map(label => (
          <button
            key={label}
            onClick={() => handleQuickReply(label)}
            disabled={sending}
            className="shrink-0 bg-dark-card border border-dark-border text-neutral-300 text-sm font-medium px-4 py-2 rounded-full hover:border-amber-gold/50 hover:text-amber-gold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {label}
          </button>
        ))}
        <button
          onClick={endSession}
          disabled={sending}
          className="shrink-0 bg-red-900/30 border border-red-700/40 text-red-400 text-sm font-medium px-4 py-2 rounded-full hover:border-red-500/50 transition-colors disabled:opacity-50 cursor-pointer"
        >
          End Session
        </button>
      </div>

      {/* Text Input */}
      <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2 shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask your sous chef anything..."
            disabled={sending}
            className="flex-1 bg-dark-card border border-dark-border rounded-xl px-4 py-3 text-[16px] text-white placeholder-neutral-600 focus:outline-none focus:border-amber-gold/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-amber-gold text-neutral-900 font-semibold px-5 py-3 rounded-xl hover:bg-amber-light transition-colors disabled:opacity-50 cursor-pointer"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  )
}
