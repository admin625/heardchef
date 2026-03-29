import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DifficultyBadge from '../components/DifficultyBadge'

const PHONE_KEY = 'hc_whatsapp_phone'
const USER_ID_KEY = 'hc_user_id'

function formatScaledNumber(n) {
  if (n === Math.floor(n)) return String(n)
  const fracs = [[0.25, '1/4'], [0.33, '1/3'], [0.5, '1/2'], [0.67, '2/3'], [0.75, '3/4']]
  const whole = Math.floor(n)
  const remainder = n - whole
  for (const [val, label] of fracs) {
    if (Math.abs(remainder - val) < 0.05) return whole > 0 ? `${whole} ${label}` : label
  }
  return n.toFixed(1).replace(/\.0$/, '')
}

function scaleAmount(amount, multiplier) {
  if (!amount || multiplier === 1) return amount
  const str = String(amount).trim()
  if (/[a-zA-Z]/.test(str)) return str
  const fracMatch = str.match(/^(\d+)\/(\d+)$/)
  if (fracMatch) return formatScaledNumber((parseInt(fracMatch[1]) / parseInt(fracMatch[2])) * multiplier)
  const num = parseFloat(str)
  return isNaN(num) ? str : formatScaledNumber(num * multiplier)
}

export default function RecipeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState(null)
  const [chef, setChef] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null)
  const [selectedServings, setSelectedServings] = useState(null)
  const [confirmedServings, setConfirmedServings] = useState(null)
  const [ingredientFlash, setIngredientFlash] = useState(false)
  const [cookMode, setCookMode] = useState('voice')

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const sendShoppingList = useCallback(async (phone) => {
    if (!recipe) return
    setSending(true)
    try {
      const res = await fetch('/api/send-shopping-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phone,
          recipeName: recipe.title,
          ingredients: (recipe.ingredients || []).map(i => ({
            ...i,
            amount: scaleAmount(i.amount, (confirmedServings || recipe.servings) / (recipe.servings || 2)),
          })),
          portions: confirmedServings || recipe.servings,
          userId: localStorage.getItem(USER_ID_KEY) || null,
          recipeId: recipe.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')

      localStorage.setItem(PHONE_KEY, phone)
      if (data.userId) localStorage.setItem(USER_ID_KEY, data.userId)

      setShowPhoneModal(false)
      showToast('Shopping list sent to WhatsApp!')
    } catch (err) {
      showToast(err.message || 'Failed to send shopping list', 'error')
    } finally {
      setSending(false)
    }
  }, [recipe, confirmedServings, showToast])

  const handleShoppingListClick = useCallback(() => {
    const savedPhone = localStorage.getItem(PHONE_KEY)
    if (savedPhone) {
      sendShoppingList(savedPhone)
    } else {
      setPhoneInput('')
      setShowPhoneModal(true)
    }
  }, [sendShoppingList])

  useEffect(() => {
    async function load() {
      const { data: recipeData } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', id)
        .single()

      if (recipeData) {
        const { data: chefData } = await supabase
          .from('chefs')
          .select('id, name')
          .eq('id', recipeData.chef_id)
          .single()
        setChef(chefData)
        setSelectedServings(recipeData.servings)
        setConfirmedServings(recipeData.servings)
      }

      setRecipe(recipeData)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-amber-gold text-lg">Loading recipe...</div>
      </div>
    )
  }

  if (!recipe) {
    return <div className="text-center pt-12 text-neutral-400">Recipe not found.</div>
  }

  const ingredients = recipe.ingredients || []
  const steps = recipe.steps || []
  const tags = recipe.tags || []

  return (
    <div className="pt-8">
      {chef && (
        <Link to={`/chef/${chef.id}`} className="text-amber-gold text-sm hover:underline">
          &larr; {chef.name}
        </Link>
      )}

      <div className="mt-6 mb-8">
        <h1 className="text-3xl font-bold text-white mb-3">{recipe.title}</h1>
        <p className="text-neutral-400 mb-4 leading-relaxed">{recipe.description}</p>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <DifficultyBadge difficulty={recipe.difficulty} />
          <span className="text-neutral-500 text-sm">Prep: {recipe.prep_time_minutes}m</span>
          <span className="text-neutral-500 text-sm">Cook: {recipe.cook_time_minutes}m</span>
          <span className="text-amber-gold text-sm font-semibold">Total: {recipe.total_time_minutes}m</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.map((tag, i) => (
            <span key={i} className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Cooking Mode Selector */}
      <section className="mb-6 bg-dark-card border border-dark-border rounded-xl p-5">
        <h3 className="text-white font-semibold text-lg mb-3">Cooking Mode</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setCookMode('voice')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer ${cookMode === 'voice' ? 'bg-amber-gold/20 border border-amber-gold/50 text-amber-gold' : 'bg-neutral-800 border border-dark-border text-neutral-400 hover:border-neutral-600'}`}
          >
            Voice Mode
          </button>
          <button
            onClick={() => setCookMode('read')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer ${cookMode === 'read' ? 'bg-amber-gold/20 border border-amber-gold/50 text-amber-gold' : 'bg-neutral-800 border border-dark-border text-neutral-400 hover:border-neutral-600'}`}
          >
            Read Mode
          </button>
        </div>
        <p className="text-neutral-500 text-xs mt-2">
          {cookMode === 'voice'
            ? 'AI chef guides you step-by-step with voice and conversation.'
            : 'Clean step-by-step view — no voice, no AI. Tap to navigate.'}
        </p>
      </section>

      {/* Serving Size Selector */}
      <section className="mb-6 bg-dark-card border border-dark-border rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold text-lg">Servings</h3>
            <p className="text-neutral-500 text-sm">Recipe default: {recipe.servings}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedServings(s => Math.max(1, s - 1))}
              disabled={selectedServings <= 1}
              className="w-10 h-10 rounded-full bg-neutral-800 border border-dark-border text-white text-xl font-bold flex items-center justify-center hover:border-amber-gold/50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              &minus;
            </button>
            <span className="text-2xl font-bold text-amber-gold w-8 text-center">{selectedServings}</span>
            <button
              onClick={() => setSelectedServings(s => Math.min(12, s + 1))}
              disabled={selectedServings >= 12}
              className="w-10 h-10 rounded-full bg-neutral-800 border border-dark-border text-white text-xl font-bold flex items-center justify-center hover:border-amber-gold/50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              +
            </button>
            {selectedServings !== confirmedServings && (
              <button
                onClick={() => {
                  setConfirmedServings(selectedServings)
                  setIngredientFlash(true)
                  setTimeout(() => setIngredientFlash(false), 1200)
                }}
                className="ml-2 px-3 py-1.5 bg-amber-gold text-neutral-900 text-xs font-bold rounded-lg hover:bg-amber-light transition-colors cursor-pointer"
              >
                Set
              </button>
            )}
          </div>
        </div>
        {selectedServings !== confirmedServings && (
          <p className="text-amber-gold text-xs mt-2">
            Tap Set to update ingredient quantities to {selectedServings} {selectedServings === 1 ? 'serving' : 'servings'}.
          </p>
        )}
        {selectedServings === confirmedServings && confirmedServings !== recipe.servings && (
          <p className="text-amber-gold/70 text-xs mt-2">
            Ingredients scaled for {confirmedServings} servings (base: {recipe.servings}).
          </p>
        )}
      </section>

      {/* Ingredients */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-amber-gold mb-4 border-b border-dark-border pb-2">
          Ingredients
          {confirmedServings !== recipe.servings && (
            <span className="text-sm font-normal text-amber-gold/60 ml-2">
              — scaled for {confirmedServings} servings
            </span>
          )}
        </h2>
        <ul className="space-y-2">
          {ingredients.map((ing, i) => {
            const multiplier = confirmedServings / (recipe.servings || 2)
            const displayAmount = scaleAmount(ing.amount, multiplier)
            return (
              <li
                key={i}
                className="flex items-start gap-3 py-1 px-2 -mx-2 rounded-lg transition-colors duration-700"
                style={{ backgroundColor: ingredientFlash ? 'rgba(245, 158, 11, 0.1)' : 'transparent' }}
              >
                <span className="w-2 h-2 rounded-full bg-amber-gold mt-2 shrink-0" />
                <div>
                  <span className="text-white">
                    {displayAmount} {ing.unit} {ing.item}
                  </span>
                  {ing.substitutions?.length > 0 && (
                    <span className="text-neutral-500 text-sm ml-2">
                      (sub: {ing.substitutions.join(', ')})
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-amber-gold mb-6 border-b border-dark-border pb-2">
          Instructions
        </h2>
        <div className="space-y-8">
          {steps.map((step) => (
            <div key={step.step_number} className="relative pl-12">
              <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-amber-gold/20 border border-amber-gold/40 flex items-center justify-center text-amber-gold font-bold text-sm">
                {step.step_number}
              </div>
              <div>
                <p className="text-[20px] leading-relaxed text-neutral-200 mb-3">
                  {step.instruction}
                </p>

                {step.duration_minutes > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded">
                      {step.timer_needed ? '\u23F1\uFE0F' : '\u23F0'} {step.duration_minutes} min
                    </span>
                  </div>
                )}

                {step.technique_notes && (
                  <div className="bg-neutral-800/50 border-l-2 border-amber-gold/40 px-4 py-2 rounded-r-lg mb-2">
                    <p className="text-sm text-neutral-400">
                      <span className="text-amber-gold font-semibold">Technique:</span> {step.technique_notes}
                    </p>
                  </div>
                )}

                {step.chef_tip && (
                  <div className="bg-amber-gold/5 border-l-2 border-amber-gold px-4 py-2 rounded-r-lg">
                    <p className="text-sm text-amber-light">
                      <span className="font-semibold">Chef&apos;s Tip:</span> {step.chef_tip}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {recipe.chef_notes && (
        <section className="mb-8 bg-dark-card border border-dark-border rounded-xl p-6">
          <h2 className="text-xl font-bold text-amber-gold mb-3">Chef&apos;s Notes</h2>
          <p className="text-neutral-300 leading-relaxed italic">&ldquo;{recipe.chef_notes}&rdquo;</p>
        </section>
      )}

      {recipe.wine_pairing && (
        <section className="mb-8 bg-dark-card border border-dark-border rounded-xl p-6">
          <h2 className="text-xl font-bold text-amber-gold mb-3">Wine Pairing</h2>
          <p className="text-neutral-300">{recipe.wine_pairing}</p>
        </section>
      )}

      {recipe.source_attribution && (
        <p className="text-xs text-neutral-600 mb-8 italic">{recipe.source_attribution}</p>
      )}

      <div className="flex flex-col items-center gap-2 mb-8">
        <button
          onClick={handleShoppingListClick}
          disabled={sending}
          className="w-full bg-dark-card border border-dark-border text-neutral-300 font-semibold py-3 px-6 rounded-xl hover:border-amber-gold/50 hover:text-amber-gold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
        >
          {sending ? 'Sending...' : 'Send Shopping List via WhatsApp'}
        </button>
        {localStorage.getItem(PHONE_KEY) && (
          <button
            onClick={() => { setPhoneInput(localStorage.getItem(PHONE_KEY) || ''); setShowPhoneModal(true) }}
            className="text-xs text-neutral-500 hover:text-amber-gold transition-colors"
          >
            change number
          </button>
        )}
      </div>

      {/* Spacer for sticky bar */}
      <div className="h-20" />

      {/* Sticky Start Cooking Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-t border-dark-border px-4 py-3 safe-bottom">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => navigate(`/cook/${recipe.id}?servings=${confirmedServings}&mode=${cookMode}`)}
            className="w-full bg-amber-gold text-neutral-900 font-bold py-3.5 px-6 rounded-xl hover:bg-amber-light transition-colors cursor-pointer text-base"
          >
            Start Cooking — {confirmedServings} {confirmedServings === 1 ? 'serving' : 'servings'}, {cookMode === 'voice' ? 'Voice' : 'Read'} Mode
          </button>
        </div>
      </div>

      {/* Phone Number Modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => !sending && setShowPhoneModal(false)}>
          <div className="bg-neutral-900 border border-dark-border rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Send to WhatsApp</h3>
            <p className="text-neutral-400 text-sm mb-4">
              Enter your WhatsApp number and we&apos;ll send the shopping list for <span className="text-amber-gold">{recipe.title}</span>.
            </p>
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+1 (555) 123-4567"
              autoFocus
              className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-amber-gold placeholder-neutral-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && phoneInput.trim()) sendShoppingList(phoneInput.trim())
              }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowPhoneModal(false)}
                disabled={sending}
                className="flex-1 bg-neutral-800 text-neutral-300 font-semibold py-2.5 rounded-xl hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => sendShoppingList(phoneInput.trim())}
                disabled={!phoneInput.trim() || sending}
                className="flex-1 bg-amber-gold text-neutral-900 font-semibold py-2.5 rounded-xl hover:bg-amber-light transition-colors disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl font-semibold text-sm shadow-lg transition-all ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
