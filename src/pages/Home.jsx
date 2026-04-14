import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── ARCHETYPE ACCENT COLORS (muted, rich tones) ───
const ARCHETYPE_ACCENTS = {
  'The American in Paris': { bg: '#4a1942', ring: '#7b2d6e', text: '#d4a0c9' },   // muted plum
  'The Classicist':        { bg: '#1a2f1a', ring: '#2d5a2d', text: '#8fbf8f' },   // forest green
  'The Maverick':          { bg: '#3d1f1f', ring: '#6b3333', text: '#c98a8a' },   // burgundy
  'The Perfectionist':     { bg: '#1a2433', ring: '#2d4466', text: '#8aa8cc' },   // navy slate
  'The Original':          { bg: '#2d2a1f', ring: '#5a5233', text: '#c9bf8a' },   // aged gold
  'The Grill':             { bg: '#331f10', ring: '#664020', text: '#cc9966' },   // burnt amber
  'The Craftsman':         { bg: '#1f2d2d', ring: '#335a5a', text: '#8abfbf' },   // deep teal
  'The Host':              { bg: '#2d2d1f', ring: '#5a5a33', text: '#c9c98a' },   // warm linen
  'The Indulgent':         { bg: '#2d1f2d', ring: '#5a335a', text: '#bf8abf' },   // velvet mauve
}

const DEFAULT_ACCENT = { bg: '#262626', ring: '#3a3a3a', text: '#a3a3a3' }

// ─── COMING SOON ARCHETYPES ───
const COMING_SOON = [
  { name: 'The Original',  tagline: 'Simplicity. Sauce. Silence.',        cuisine: 'Modern British' },
  { name: 'The Grill',     tagline: 'Fire does things nothing else can.', cuisine: 'American Southwest' },
  { name: 'The Craftsman', tagline: 'Repetition is how mastery is built.', cuisine: 'French-American' },
  { name: 'The Matriarch', tagline: 'Every meal is a memory being made.', cuisine: 'Southern American' },
]

function getInitials(name) {
  // "The American in Paris" → "AP", "The Classicist" → "C", "The Maverick" → "M"
  const words = name.replace(/^The\s+/i, '').split(/\s+/).filter(w => !['in', 'of', 'the', 'and'].includes(w.toLowerCase()))
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function Home() {
  const [chefs, setChefs] = useState([])
  const [recipeCounts, setRecipeCounts] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: chefsData } = await supabase
        .from('chefs')
        .select('*')
        .eq('is_active', true)
        .order('name')

      const { data: recipes } = await supabase
        .from('recipes')
        .select('chef_id')

      const counts = {}
      recipes?.forEach(r => {
        counts[r.chef_id] = (counts[r.chef_id] || 0) + 1
      })

      setChefs(chefsData || [])
      setRecipeCounts(counts)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-amber-gold text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="pt-6 pb-12 px-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-500 mb-3">Est. 2026</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
          HeardChef
        </h1>
        <div className="w-12 h-px bg-amber-gold/40 mx-auto my-4" />
        <p className="text-neutral-400 text-sm sm:text-base tracking-wide">
          Choose your archetype. Learn their craft.
        </p>
      </div>

      {/* Chef Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
        {chefs.map(chef => {
          const accent = ARCHETYPE_ACCENTS[chef.name] || DEFAULT_ACCENT
          const initials = getInitials(chef.name)
          const count = recipeCounts[chef.id] || 0

          return (
            <Link
              key={chef.id}
              to={`/chef/${chef.id}`}
              className="group relative flex flex-col items-center text-center rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
              style={{
                background: `linear-gradient(160deg, ${accent.bg} 0%, var(--surface-bg) 70%)`,
                border: `1px solid ${accent.ring}33`,
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = accent.ring + '88'}
              onMouseLeave={e => e.currentTarget.style.borderColor = accent.ring + '33'}
            >
              {/* Signet Ring Monogram */}
              <div
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center mb-4 transition-all duration-300 group-hover:shadow-lg"
                style={{
                  background: `radial-gradient(circle at 30% 30%, ${accent.ring}40, ${accent.bg})`,
                  border: `2px solid ${accent.ring}`,
                  boxShadow: `inset 0 2px 8px ${accent.ring}30, 0 0 0 1px ${accent.ring}20`,
                }}
              >
                {chef.photo_url ? (
                  <img src={chef.photo_url} alt={chef.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span
                    className="text-2xl sm:text-3xl font-semibold tracking-wide"
                    style={{ fontFamily: "'Playfair Display', serif", color: accent.text }}
                  >
                    {initials}
                  </span>
                )}
              </div>

              {/* Archetype Name */}
              <h2
                className="text-base sm:text-lg font-semibold text-white mb-1 leading-tight"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {chef.name}
              </h2>

              {/* Tagline */}
              {chef.tagline && (
                <p className="text-xs sm:text-sm italic mb-2 leading-snug" style={{ color: accent.text }}>
                  "{chef.tagline}"
                </p>
              )}

              {/* Cuisine Tag */}
              <span
                className="inline-block text-[10px] sm:text-xs uppercase tracking-widest px-2 py-0.5 rounded-full mb-3"
                style={{
                  color: accent.text,
                  background: accent.ring + '25',
                  border: `1px solid ${accent.ring}40`,
                }}
              >
                {chef.cuisine_specialty?.split(',')[0] || 'Culinary'}
              </span>

              {/* Recipe Count */}
              <div className="text-neutral-500 text-xs">
                {count} {count === 1 ? 'recipe' : 'recipes'}
              </div>
            </Link>
          )
        })}
      </div>

      {/* ─── COMING SOON DIVIDER ─── */}
      <div className="flex items-center gap-4 my-10">
        <div className="flex-1 h-px bg-neutral-800" />
        <span className="text-[10px] uppercase tracking-[0.3em] text-neutral-600">
          More archetypes coming
        </span>
        <div className="flex-1 h-px bg-neutral-800" />
      </div>

      {/* ─── COMING SOON GRID ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {COMING_SOON.map(arch => {
          const accent = ARCHETYPE_ACCENTS[arch.name] || DEFAULT_ACCENT
          const initials = getInitials(arch.name)
          return (
            <div
              key={arch.name}
              className="relative flex flex-col items-center text-center rounded-2xl p-4 sm:p-5 opacity-50 cursor-default select-none"
              style={{ background: 'var(--surface-bg)', border: '1px solid var(--surface-border)' }}
            >
              {/* Muted Signet */}
              <div
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mb-3"
                style={{ background: 'var(--surface-card)', border: '2px solid var(--surface-border)' }}
              >
                <span
                  className="text-lg sm:text-xl font-semibold text-neutral-600"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {initials}
                </span>
              </div>

              <h3
                className="text-sm font-semibold text-neutral-500 mb-1"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {arch.name}
              </h3>

              <p className="text-[10px] italic text-neutral-600 mb-2">
                "{arch.tagline}"
              </p>

              <span className="inline-block text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full text-neutral-600 bg-neutral-800/50 border border-neutral-700/50">
                Coming Soon
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer Mark */}
      <div className="text-center mt-10">
        <div className="w-8 h-px bg-neutral-700 mx-auto mb-3" />
        <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-600">
          Private Kitchen
        </p>
      </div>
    </div>
  )
}
