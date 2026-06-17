import { upstashCommand } from '../../lib/upstash'
import fs from 'fs'
import path from 'path'

function calcPoints(match, pred) {
  let points = 0
  const stage = (match.stage_name || '').toLowerCase()
  const isFinal = /final/i.test(stage)
  const isKnockout = !/group/i.test(stage) && /round|quarter|semi|knockout|third|final/i.test(stage)
  const winner = match.home_team.goals > match.away_team.goals ? 'home' : match.home_team.goals < match.away_team.goals ? 'away' : 'draw'
  const predWinner = pred.winner
  if (predWinner === winner) points += 1
  if (pred.homeGoals === match.home_team.goals) points += 2
  if (pred.awayGoals === match.away_team.goals) points += 2
  if (isFinal) points *= 5
  else if (isKnockout) points *= 2
  return points
}

async function loadMatches() {
  if (process.env.UPSTASH_REST_URL && process.env.UPSTASH_REST_TOKEN) {
    try {
      const cached = await upstashCommand(['GET', 'matches'])
      const val = cached && (cached.result || cached)
      if (val) {
        try { return JSON.parse(val) } catch (e) {}
      }
    } catch (e) { console.warn('Upstash GET matches failed', e) }
  }
  const localPath = path.join(process.cwd(), 'data', 'matches.json')
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf8'))
  }
  return []
}

export default async function handler(req, res) {
  try {
    // DEV fallback: if seeded predictions file exists, compute locally and return
    const seededPath = path.join(process.cwd(), 'data', 'seeded_predictions.json')
    if (process.env.NODE_ENV !== 'production' && fs.existsSync(seededPath)) {
      const seeded = JSON.parse(fs.readFileSync(seededPath, 'utf8'))
      const matches = await loadMatches()
      const scores = {}
      for (const m of matches) {
        const id = m.fifa_id || m.id
        if (m.home_team?.goals == null || m.away_team?.goals == null) continue
        const preds = seeded[id] || []
        for (const p of preds) {
          const user = p.user || p.email || p.name || 'anon'
          const name = p.name || p.user || 'anon'
          const pts = calcPoints(m, p)
          if (!scores[user]) scores[user] = { user, name, points: 0 }
          scores[user].points += pts
        }
      }
      const arr = Object.values(scores).sort((a,b)=>b.points - a.points)
      return res.json({ leaderboard: arr })
    }
    const matches = await loadMatches()
    const scores = {}
    // iterate matches and fetch predictions per match
    for (const m of matches) {
      const id = m.fifa_id || m.id
      const key = `predictions:${id}`
      let predsRaw = null
      try {
        // try list-based LRANGE first
        const r = await upstashListRange(key, 0, -1)
        if (r) predsRaw = r.result || r
      } catch (e) {
        try {
          const r2 = await upstashCommand(['LRANGE', key, '0', '-1'])
          if (r2) predsRaw = r2.result || r2
        } catch (e2) {
          predsRaw = null
        }
      }
      // fallback: check local seeded predictions file (dev convenience)
      if (!predsRaw) {
        try {
          const seededPath = path.join(process.cwd(), 'data', 'seeded_predictions.json')
          if (fs.existsSync(seededPath)) {
            const seeded = JSON.parse(fs.readFileSync(seededPath, 'utf8'))
            if (seeded && seeded[id]) preds = seeded[id]
          }
        } catch (e) {}
      }
      let preds = preds || []
      // predsRaw may be a JSON string of an array, or an array already
      if (typeof predsRaw === 'string') {
        try { preds = JSON.parse(predsRaw) } catch (e) { preds = [] }
      } else if (Array.isArray(predsRaw)) {
        // elements might be JSON strings
        preds = predsRaw.map(p => (typeof p === 'string' ? JSON.parse(p) : p))
      } else if (predsRaw && predsRaw.result) {
        // nested shape
        try { preds = JSON.parse(predsRaw.result) } catch (e) { preds = [] }
      }
      // only compute if match has final score
      if (m.home_team?.goals == null || m.away_team?.goals == null) continue
      for (const p of preds) {
        const user = p.user || p.email || p.name || 'anon'
        const name = p.name || p.user || 'anon'
        const pts = calcPoints(m, p)
        if (!scores[user]) scores[user] = { user, name, points: 0 }
        scores[user].points += pts
      }
    }
    const arr = Object.values(scores).sort((a,b)=>b.points - a.points)
    return res.json({ leaderboard: arr })
  } catch (err) {
    console.error('Leaderboard error', err)
    res.status(500).json({ error: 'Failed to compute leaderboard' })
  }
}
