import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { session, profile, signInWithEmail, ensureProfile, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSendLink(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await signInWithEmail(email)
    if (error) setError(error)
    else setSent(true)
  }

  async function handleCreateProfile(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await ensureProfile(username.trim())
    if (error) setError(error)
  }

  if (session && !profile) {
    return (
      <div className="card">
        <h2>Välj användarnamn</h2>
        <p>Du är inloggad som {session.user.email}. Sista steget — visa dig för ligan:</p>
        <form onSubmit={handleCreateProfile}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Ditt managernamn"
            required
            minLength={2}
          />
          <button type="submit">Skapa profil</button>
        </form>
        {error && <p className="error">{error}</p>}
        <button className="link" onClick={signOut}>
          Logga ut
        </button>
      </div>
    )
  }

  if (session && profile) return null // App.tsx renderar resten

  return (
    <div className="card">
      <h1>⚽ Fotbollsmanager Online</h1>
      <p>Logga in med din mejl — du får en engångslänk, inget lösenord behövs.</p>
      {sent ? (
        <p>Länk skickad till <strong>{email}</strong>. Klicka på den för att logga in.</p>
      ) : (
        <form onSubmit={handleSendLink}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="din@mejl.se"
            required
          />
          <button type="submit">Skicka inloggningslänk</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
