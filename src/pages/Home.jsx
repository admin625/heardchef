import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
        <div className="text-amber-gold text-lg">Loading chefs...</div>
      </div>
    )
  }

  return (
    <div className="pt-8">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-white mb-2">
          Cook with <span className="text-amber-gold">Legends</span>
        </h1>
        <p className="text-neutral-400 text-lg">
          Choose your chef. Learn their secrets.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {chefs.map(chef => (
          <Link
            key={chef.id}
            to={`/chef/${chef.id}`}
            className="group bg-dark-card border border-dark-border rounded-2xl p-6 transition-all hover:border-amber-gold/50 hover:shadow-lg hover:shadow-amber-gold/5"
          >
            <div className="w-20 h-20 rounded-full bg-neutral-800 flex items-center justify-center mx-auto mb-4 text-4xl group-hover:ring-2 group-hover:ring-amber-gold/40 transition-all">
              {chef.name === 'Anthony Bourdain' && '\uD83D\uDD2A'}
              {chef.name === 'Jacques P\u00e9pin' && '\uD83C\uDF73'}
              {chef.name === 'Julia Child' && '\uD83E\uDDC8'}
              {chef.name === 'Ina Garten' && '\uD83C\uDF3F'}
            </div>
            <h2 className="text-xl font-semibold text-white mb-1">{chef.name}</h2>
            <p className="text-sm text-amber-gold mb-3">{chef.cuisine_specialty}</p>
            <div className="flex items-center justify-center gap-1 text-neutral-500 text-sm">
              <span>{recipeCounts[chef.id] || 0} recipes</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
