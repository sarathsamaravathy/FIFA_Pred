import { useSession } from 'next-auth/react'

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'sarathsamaravathy@gmail.com').split(',').map(s=>s.trim().toLowerCase())
import { useEffect, useState } from 'react'

export default function Admin() {
  const { data: session } = useSession()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    fetch('/api/matches').then(r => r.json()).then(data => { setMatches(data); setLoading(false) }).catch(() => setLoading(false))
  }, [session])

  async function save(match) {
    const id = match.fifa_id || match.id
    await fetch(`/api/admin/match/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(match) })
    alert('Saved')
  }

  if (!session) return <div style={{padding:20}}>Please sign in to access admin.</div>
  const email = session.user?.email?.toLowerCase()
  if (!ADMIN_EMAILS.includes(email)) return <div style={{padding:20}}>Access denied — you are not an admin.</div>

  return (
    <div style={{padding:20}}>
      <h1>Admin — Edit Matches</h1>
      {loading && <p>Loading…</p>}
      {!loading && matches && matches.map(m => (
        <div key={m.fifa_id || m.id} style={{border:'1px solid #eee',padding:10,marginBottom:8}}>
          <div><strong>{m.home_team.country}</strong> vs <strong>{m.away_team.country}</strong></div>
          <div>
            <label>Datetime: <input value={m.datetime} onChange={e=>{m.datetime=e.target.value; setMatches([...matches])}} /></label>
          </div>
          <div>
            <label>Home: <input value={m.home_team.country} onChange={e=>{m.home_team.country=e.target.value; setMatches([...matches])}} /></label>
            <label style={{marginLeft:8}}>Away: <input value={m.away_team.country} onChange={e=>{m.away_team.country=e.target.value; setMatches([...matches])}} /></label>
          </div>
          <div>
            <label>Stage: <input value={m.stage_name} onChange={e=>{m.stage_name=e.target.value; setMatches([...matches])}} /></label>
          </div>
          <div>
            <label>Home goals: <input type="number" value={m.home_team?.goals ?? ''} onChange={e=>{m.home_team = m.home_team || {}; m.home_team.goals = e.target.value; setMatches([...matches])}} /></label>
            <label style={{marginLeft:8}}>Away goals: <input type="number" value={m.away_team?.goals ?? ''} onChange={e=>{m.away_team = m.away_team || {}; m.away_team.goals = e.target.value; setMatches([...matches])}} /></label>
          </div>
          <div style={{marginTop:8}}>
            <button onClick={()=>save(m)}>Save</button>
          </div>
        </div>
      ))}
    </div>
  )
}
