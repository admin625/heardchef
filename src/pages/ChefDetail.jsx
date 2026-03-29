import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DifficultyBadge from '../components/DifficultyBadge'

const ARCHETYPE_ACCENTS = {
  'The American in Paris': { bg: '#4a1942', ring: '#7b2d6e', text: '#d4a0c9' },
  'The Classicist':        { bg: '#1a2f1a', ring: '#2d5a2d', text: '#8fbf8f' },
  'The Maverick':          { bg: '#3d1f1f', ring: '#6b3333', text: '#c98a8a' },
  'The Perfectionist':     { bg: '#1a2433', ring: '#2d4466', text: '#8aa8cc' },
  'The Original':          { bg: '#2d2a1f', ring: '#5a5233', text: '#c9bf8a' },
  'The Grill':             { bg: '#331f10', ring: '#664020', text: '#cc9966' },
  'The Craftsman':         { bg: '#1f2d2d', ring: '#335a5a', text: '#8abfbf' },
  'The Host':              { bg: '#2d2d1f', ring: '#5a5a33', text: '#c9c98a' },
  'The Indulgent':         { bg: '#2d1f2d', ring: '#5a335a', text: '#bf8abf' },
}
const DEFAULT_ACCENT = { bg: '#262626', ring: '#3a3a3a', text: '#a3a3a3' }

function getInitials(name) {
  const words = name.replace(/^The\s+/i, '').split(/\s+/).filter(w => !['in', 'of', 'the', 'and'].includes(w.toLowerCase()))
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function ChefDetail() {
  const { id } = useParams()
  const [chef, setChef] = useState(null)
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: chefData } = await supabase
        .from('chefs')
        .select('*')
        .eq('id', id)
        .single()

      const { data: recipesData } = await supabase
        .from('recipes')
        .select('id, title, difficulty, total_time_minutes, cuisine_type, photo_url')
        .eq('chef_id', id)
        .eq('is_active', true)
        .order('title')

      setChef(chefData)
      setRecipes(recipesData || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-amber-gold text-lg">Loading...</div>
      </div>
    )
  }

  if (!chef) {
    return <div className="text-center pt-12 text-neutral-400">Chef not found.</div>
  }

  return (
    <div className="pt-8">
      <Link to="/" className="text-amber-gold text-sm hover:underline">&larr; All Chefs</Link>

      <div className="mt-6 mb-8 text-center">
        {(() => {
          const accent = ARCHETYPE_ACCENTS[chef.name] || DEFAULT_ACCENT
          const initials = getInitials(chef.name)
          return (
            <>
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{
                  background: `radial-gradient(circle at 30% 30%, ${accent.ring}40, ${accent.bg})`,
                  border: `2px solid ${accent.ring}`,
                  boxShadow: `inset 0 2px 8px ${accent.ring}30, 0 0 0 1px ${accent.ring}20`,
                }}
              >
                {chef.photo_url ? (
                  <img src={chef.photo_url} alt={chef.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-4xl font-semibold tracking-wide" style={{ fontFamily: "'Playfair Display', serif", color: accent.text }}>
                    {initials}
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-bold text-white mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>{chef.name}</h1>
              {chef.tagline && <p className="text-sm italic mb-2" style={{ color: accent.text }}>"{chef.tagline}"</p>}
              <p className="text-amber-gold text-sm mb-3">{chef.cuisine_specialty}</p>
              <p className="text-neutral-400 text-sm max-w-md mx-auto leading-relaxed">{chef.bio}</p>
            </>
          )
        })()}
      </div>

      <h2 className="text-xl font-semibold text-white mb-4">
        Recipes <span className="text-neutral-500 text-base font-normal">({recipes.length})</span>
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {recipes.map(recipe => (
          <Link
            key={recipe.id}
            to={`/recipe/${recipe.id}`}
            className="group bg-dark-card border border-dark-border rounded-xl p-5 transition-all hover:border-amber-gold/50"
          >
            <div className="w-full h-32 rounded-lg bg-neutral-800 flex items-center justify-center mb-3 text-3xl">
              {recipe.cuisine_type === 'French' ? '\uD83C\uDDEB\uD83C\uDDF7' : '\uD83C\uDF7D\uFE0F'}
            </div>
            <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-amber-gold transition-colors">
              {recipe.title}
            </h3>
            <div className="flex items-center justify-between">
              <DifficultyBadge difficulty={recipe.difficulty} />
              <span className="text-neutral-500 text-sm">{recipe.total_time_minutes} min</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
