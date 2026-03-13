import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ChefDetail from './pages/ChefDetail'
import RecipeDetail from './pages/RecipeDetail'
import Header from './components/Header'

export default function App() {
  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      <main className="max-w-[768px] mx-auto px-4 pb-12">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chef/:id" element={<ChefDetail />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
        </Routes>
      </main>
    </div>
  )
}
