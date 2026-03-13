const colors = {
  easy: 'bg-green-600/20 text-green-400 border-green-600/30',
  medium: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  advanced: 'bg-red-600/20 text-red-400 border-red-600/30',
}

export default function DifficultyBadge({ difficulty }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colors[difficulty] || colors.medium}`}>
      {difficulty}
    </span>
  )
}
