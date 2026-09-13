/**
 * Litet lagmärke (vapensköld) i klubbens egna färger. Färgerna kommer från
 * teams.primary_color / teams.secondary_color (hex), satta av lagägaren på
 * lagsidan. Rent visuellt bara — ingen logik.
 */
interface TeamBadgeProps {
  name: string
  primaryColor?: string | null
  secondaryColor?: string | null
  size?: number
}

export default function TeamBadge({ name, primaryColor, secondaryColor, size = 26 }: TeamBadgeProps) {
  const primary = primaryColor || '#1d4ed8'
  const secondary = secondaryColor || '#ffffff'
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?'

  return (
    <svg
      width={size}
      height={size * 1.1}
      viewBox="0 0 40 44"
      style={{ verticalAlign: 'middle', flexShrink: 0, marginRight: '0.4rem' }}
      aria-hidden="true"
    >
      <path
        d="M20 2 L36 8 V22 C36 32 29 40 20 43 C11 40 4 32 4 22 V8 Z"
        fill={primary}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="1"
      />
      <path d="M20 2 L36 8 V22 C36 32 29 40 20 43 Z" fill={secondary} opacity="0.35" />
      <text
        x="20"
        y="27"
        textAnchor="middle"
        fontSize="17"
        fontWeight="700"
        fill={contrastColor(primary)}
        fontFamily="system-ui, sans-serif"
      >
        {initial}
      </text>
    </svg>
  )
}

function contrastColor(hex: string): string {
  const c = hex.replace('#', '')
  if (c.length !== 6) return '#fff'
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#111' : '#fff'
}
