import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DifficultyBadge from '../components/DifficultyBadge'

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
        <div className="w-24 h-24 rounded-full bg-neutral-800 flex items-center justify-center mx-auto mb-4 text-5xl">
          {chef.name === 'Anthony Bourdain' && '\uD83D\uDD2A'}
          {chef.name === 'Jacques P\u00e9pin' && '\uD83C\uDF73'}
          {chef.name === 'Julia Child' && '\uD83E\uDDC8'}
          {chef.name === 'Ina Garten' && '\uD83C\uDF3F'}
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">{chef.name}</h1>
        <p className="text-amber-gold mb-3">{chef.cuisine_specialty}</p>
        <p className="text-neutral-400 text-sm max-w-md mx-auto leading-relaxed">{chef.bio}</p>
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
