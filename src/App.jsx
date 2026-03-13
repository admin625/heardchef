import { Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import ChefDetail from './pages/ChefDetail'
import RecipeDetail from './pages/RecipeDetail'
import CookingSession from './pages/CookingSession'
import Header from './components/Header'

export default function App() {
  const location = useLocation()
  const isCooking = location.pathname.startsWith('/cook/')

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      <main className={isCooking ? 'max-w-[768px] mx-auto' : 'max-w-[768px] mx-auto px-4 pb-12'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chef/:id" element={<ChefDetail />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
          <Route path="/cook/:recipeId" element={<CookingSession />} />
        </Routes>
      </main>
    </div>
  )
}
