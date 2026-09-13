import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useMyTeam } from './hooks/useMyTeam'
import Login from './pages/Login'
import RegisterTeam from './pages/RegisterTeam'
import HomePage from './pages/HomePage'
import TeamManager from './pages/TeamManager'
import LeagueView from './pages/LeagueView'
import EconomyPage from './pages/EconomyPage'
import MarketPage from './pages/MarketPage'
import LiveMatch from './pages/LiveMatch'
import AdminPage from './pages/AdminPage'

function Nav() {
  const { profile, signOut } = useAuth()
  const { team } = useMyTeam()
  return (
    <nav className="nav">
      <Link to="/">Start</Link>
      {team && <Link to={`/team/${team.id}`}>Mitt lag</Link>}
      <Link to="/league">Tabell & cup</Link>
      {team && <Link to="/economy">Ekonomi</Link>}
      {team && <Link to="/market">Marknad</Link>}
      {profile?.is_admin && <Link to="/admin">Admin</Link>}
      <button className="link" onClick={signOut}>
        Logga ut ({profile?.username})
      </button>
    </nav>
  )
}

export default function App() {
  const { session, profile, loading } = useAuth()
  const { team, loading: teamLoading } = useMyTeam()

  if (loading) return <p className="center">Laddar…</p>
  if (!session || !profile) return <Login />
  if (teamLoading) return <p className="center">Laddar…</p>

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={team ? <HomePage /> : <RegisterTeam />} />
        <Route path="/team/:teamId" element={<TeamManager />} />
        <Route path="/league" element={<LeagueView />} />
        <Route path="/economy" element={team ? <EconomyPage /> : <Navigate to="/" replace />} />
        <Route path="/market" element={team ? <MarketPage /> : <Navigate to="/" replace />} />
        <Route path="/match/:fixtureId" element={<LiveMatch />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
