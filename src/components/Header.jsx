import { Link } from 'react-router-dom'

export default function Header() {
  return (
    <header className="border-b border-dark-border bg-dark-bg sticky top-0 z-50">
      <div className="max-w-[768px] mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-amber-gold">HeardChef</span>
        </Link>
        <span className="text-sm text-neutral-500">AI Cooking Companion</span>
      </div>
    </header>
  )
}
