import { useSession, signIn, signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'

function getVisibleMatches(matches) {
  const now = new Date()
  // sort matches by datetime ascending to ensure correct order
  const sorted = matches.slice().sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1)
  const endOfTomorrow = new Date(startOfTomorrow)
  endOfTomorrow.setUTCDate(endOfTomorrow.getUTCDate() + 1)

  const isBetween = (d, a, b) => d >= a && d < b

  // only future matches (not started yet)
  const todayMatches = sorted.filter(m => {
    const d = new Date(m.datetime)
    return d > now && isBetween(d, startOfToday, startOfTomorrow)
  })
  const tomorrowMatches = sorted.filter(m => {
    const d = new Date(m.datetime)
    return d > now && isBetween(d, startOfTomorrow, endOfTomorrow)
  })

  // show up to two matches for today and up to two for tomorrow
  const result = []
  result.push(...todayMatches.slice(0, 2))
  result.push(...tomorrowMatches.slice(0, 2))
  return result
}

function formatUTCPlus3(datetime) {
  if (!datetime) return ''
  const d = new Date(datetime)
  const shiftedMs = d.getTime() + 3 * 60 * 60 * 1000
  const sd = new Date(shiftedMs)
  const Y = sd.getUTCFullYear()
  const M = String(sd.getUTCMonth() + 1).padStart(2, '0')
  const D = String(sd.getUTCDate()).padStart(2, '0')
  const h = String(sd.getUTCHours()).padStart(2, '0')
  const m = String(sd.getUTCMinutes()).padStart(2, '0')
  return `${Y}-${M}-${D} ${h}:${m} (UTC+3)`
}

export default function Home() {
  const { data: session } = useSession()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [preds, setPreds] = useState({})
  const [leaderboard, setLeaderboard] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedUserPreds, setSelectedUserPreds] = useState([])
  const [prefetchedPreds, setPrefetchedPreds] = useState({})

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/matches')
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        if (mounted) setMatches(data)
      } catch (err) {
        console.error(err)
        if (mounted) setError('Could not load matches')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    // load leaderboard
    async function fetchLeaderboard() {
      try {
        const r = await fetch('/api/leaderboard')
        const j = await r.json()
        if (mounted && j.leaderboard) {
          setLeaderboard(j.leaderboard)
          // prefetch top N users' predictions for instant modal
          prefetchTopPreds(j.leaderboard, 10)
        }
      } catch (e) {}
    }
    fetchLeaderboard()
    // load current user's predictions
    if (session) {
      fetch('/api/predictions').then(r=>r.json()).then(j=>{
        if (j && j.predictions) {
          const map = {}
          for (const id of Object.keys(j.predictions)) {
            const p = j.predictions[id]
            map[id] = { home: p.home == null ? '' : String(p.home), away: p.away == null ? '' : String(p.away) }
          }
          if (mounted) setPreds(map)
        }
      }).catch(()=>{})
    }
    return () => { mounted = false }
  }, [])

  async function refreshLeaderboard() {
    try {
      const r = await fetch('/api/leaderboard')
      const j = await r.json()
      if (j.leaderboard) setLeaderboard(j.leaderboard)
    } catch (e) {}
  }

  // Prefetch predictions for top N leaderboard users to make modal open instant
  async function prefetchTopPreds(board, n = 10) {
    if (!board || board.length === 0) return
    const top = board.slice(0, n)
    const promises = top.map(async p => {
      try {
        const email = String(p.user)
        const r = await fetch(`/api/predictions/user/${encodeURIComponent(email)}`)
        const j = await r.json()
        const preds = (j && j.predictions) || []
        return [String(email).toLowerCase(), preds]
      } catch (e) {
        return [String(p.user).toLowerCase(), []]
      }
    })
    const results = await Promise.all(promises)
    const map = {}
    for (const [k, v] of results) map[k] = v
    setPrefetchedPreds(prev => ({ ...prev, ...map }))
  }

  async function openUserPreds(userEmail, userName) {
    // open modal immediately and show cached or loading
    setSelectedUser({ email: userEmail, name: userName })
    const cached = prefetchedPreds[String(userEmail).toLowerCase()]
    if (cached) {
      setSelectedUserPreds(cached)
      return
    }
    // show loading state
    setSelectedUserPreds(null)
    try {
      const r = await fetch(`/api/predictions/user/${encodeURIComponent(userEmail)}`)
      const j = await r.json()
      const preds = (j && j.predictions) || []
      setPrefetchedPreds(prev => ({ ...prev, [String(userEmail).toLowerCase()]: preds }))
      setSelectedUserPreds(preds)
    } catch (e) {
      setSelectedUserPreds([])
    }
  }

  function closeUserModal() {
    setSelectedUser(null)
    setSelectedUserPreds([])
  }

  const visible = getVisibleMatches(matches)

  async function submitPrediction(match) {
    const rawHome = preds[match.fifa_id]?.home
    const rawAway = preds[match.fifa_id]?.away
    const home = rawHome === undefined || rawHome === '' ? null : parseInt(rawHome, 10)
    const away = rawAway === undefined || rawAway === '' ? null : parseInt(rawAway, 10)

    const res = await fetch('/api/predictions', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        match,
        homeGoals: home,
        awayGoals: away
      }),
    })
    const j = await res.json()
    if (j.success) alert('Saved')
    else alert('Error: ' + (j.error || JSON.stringify(j)))
  }

  return (
    <div className="container">
      <div className="header">
        <div className="brand">McDonald's Bahrain FIFA 2026 predictions</div>
        <div>
          {session ? (
            <>
              <img src={session.user.image} alt="me" style={{height:32,width:32,borderRadius:16,marginRight:8}} />
              <button className="btn" onClick={() => signOut()}>Sign out</button>
            </>
          ) : (
            <button className="btn" onClick={() => signIn('google')}>Sign in with Google</button>
          )}
        </div>
      </div>

      <section>
        <h2>Upcoming Matches</h2>
        <div className="card">
          {loading && <p>Loading matches…</p>}
          {error && (
            <div style={{color:'red'}}>
              <p>Matches are temporarily unavailable.</p>
              <p style={{fontSize:13,opacity:0.9}}>{error}</p>
              <button className="btn" onClick={() => window.location.reload()}>Retry</button>
            </div>
          )}
          {!loading && !error && visible.length === 0 && <p>No upcoming matches found.</p>}
          {!loading && !error && visible.map(m => {
            const matchStarted = new Date() >= new Date(m.datetime)
            return (
            <div className="match card" key={m.fifa_id || m.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div className="teams">{m.home_team.country} vs {m.away_team.country}</div>
                <div className="meta">{formatUTCPlus3(m.datetime)} — {m.stage_name || m.stage}</div>
              </div>
              <div>
                {/* Winner is derived from scores; do not show selector */}
                {session ? (
                  <div>
                    <div>
                      <label style={{marginRight:6}}>{m.home_team.country}</label>
                      <input className="input" type="number" placeholder="0" value={preds[m.fifa_id]?.home || ''} onChange={e=>setPreds({...preds,[m.fifa_id]:{...(preds[m.fifa_id]||{}),home:e.target.value}})} />
                      <label style={{marginLeft:8,marginRight:6}}>{m.away_team.country}</label>
                      <input className="input" type="number" placeholder="0" value={preds[m.fifa_id]?.away || ''} onChange={e=>setPreds({...preds,[m.fifa_id]:{...(preds[m.fifa_id]||{}),away:e.target.value}})} />
                    </div>
                    <div style={{marginTop:8}}>
                      <button className="btn" onClick={()=>submitPrediction(m)} disabled={matchStarted}>{matchStarted ? 'Match started' : 'Predict'}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{color:'#6b7280'}}>Sign in to add your score predictions.</div>
                )}
              </div>
            </div>
          )})}
        </div>
      </section>

      <section>
        <h2>Leaderboard</h2>
        <div>
          <button className="btn" onClick={refreshLeaderboard} style={{marginBottom:8}}>Refresh</button>
          {leaderboard.length === 0 ? <p>No leaderboard yet.</p> : (
            <ol>
              {leaderboard.map(p => {
                const isMe = session && session.user && session.user.email && session.user.email.toLowerCase() === String(p.user).toLowerCase()
                return (
                  <li key={p.user} style={{cursor:'pointer', background: isMe ? '#f0f9ff' : 'transparent', padding:6, borderRadius:4}} onClick={()=>openUserPreds(p.user, p.name)}>
                    <strong>{p.name || p.user}</strong>: <span style={{fontWeight:700,color:isMe?'#0c4a6e':'inherit'}}>{p.points}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </section>

      <section className="card">
        <h3>How scoring works</h3>
        <ul>
          <li>Predict winner: 1 point</li>
          <li>Exact goals for each team: 2 points each</li>
          <li>Knockout stage: points doubled</li>
          <li>Final: points multiplied by 5</li>
        </ul>
      </section>

      {/* User predictions modal */}
      {selectedUser && (
        <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center'}} onClick={closeUserModal}>
          <div className="card" style={{width:'90%',maxWidth:700}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h3>{selectedUser.name || selectedUser.email}'s predictions</h3>
              <button className="btn" onClick={closeUserModal}>Close</button>
            </div>
            {selectedUserPreds === null ? <p>Loading predictions…</p> : selectedUserPreds.length === 0 ? <p>No predictions found for this user.</p> : (
              <div>
                {selectedUserPreds.map(item => {
                  const m = item.match
                  const p = item.prediction
                  const actual = (typeof m.home_team?.goals !== 'undefined' && m.home_team?.goals !== null)
                  return (
                    <div key={m.fifa_id || m.id} style={{padding:8,borderBottom:'1px solid #eee'}}>
                      <div style={{fontWeight:700}}>{m.home_team.country} {p.homeGoals} - {p.awayGoals} {m.away_team.country}</div>
                      <div style={{fontSize:12,color:'#666'}}>{new Date(m.datetime).toUTCString()} {m.stage_name || ''} {actual ? ` — Final: ${m.home_team.goals}-${m.away_team.goals}` : ''}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
