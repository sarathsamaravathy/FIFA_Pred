import { getSession } from 'next-auth/react'
import { getToken } from 'next-auth/jwt'
import { upstashCommand } from '../../lib/upstash'

function calcPoints(match, pred) {
  // match has status, stage_name; use simple rules
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

export default async function handler(req, res) {
  const session = await getSession({ req })
  // try to read token directly from cookie as a fallback
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!session && !token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method === 'POST') {
    const { match, homeGoals, awayGoals, winner: providedWinner } = req.body
    // check match start time
    const start = new Date(match.datetime)
    if (new Date() >= start) return res.status(400).json({ error: 'Prediction window closed' })

    // determine winner: prefer explicitly provided winner, otherwise derive from scores
    let winner
    if (providedWinner) winner = providedWinner
    else winner = homeGoals > awayGoals ? 'home' : homeGoals < awayGoals ? 'away' : 'draw'

    const userEmail = session?.user?.email || token?.email || token?.sub
    const userName = session?.user?.name || token?.name || null
    const pred = { user: userEmail, name: userName, homeGoals, awayGoals, winner, ts: new Date().toISOString() }

    // store in redis: key predictions:{match_id}
    const key = `predictions:${match.fifa_id || match.id}`
    // Try to append to JSON array if present, otherwise set a new array. Fallback to RPUSH for non-JSON storage.
    try {
      await upstashCommand(['JSON.ARRAPPEND', key, '.', JSON.stringify(pred)])
    } catch (e) {
      try {
        // set as array
        await upstashCommand(['JSON.SET', key, '.', JSON.stringify([pred])])
      } catch (e2) {
        // final fallback: push to list
        await upstashCommand(['RPUSH', key, JSON.stringify(pred)])
      }
    }

    return res.json({ success: true })
  }
  if (req.method === 'GET') {
    // Return current user's predictions across matches
    const userEmail = session?.user?.email || token?.email || token?.sub
    if (!userEmail) return res.status(401).json({ error: 'Unauthorized' })

    // load matches list
    let matches = []
    try {
      const cached = await upstashCommand(['GET', 'matches'])
      const val = cached && (cached.result || cached)
      if (val) {
        try { matches = JSON.parse(val) } catch (e) { matches = [] }
      }
    } catch (e) {
      // fallback to local file
      try {
        const fs = require('fs')
        const path = require('path')
        const localPath = path.join(process.cwd(), 'data', 'matches.json')
        if (fs.existsSync(localPath)) matches = JSON.parse(fs.readFileSync(localPath, 'utf8'))
      } catch (e2) {}
    }

    const result = {}
    for (const m of matches) {
      const id = m.fifa_id || m.id
      const key = `predictions:${id}`
      try {
        const r = await upstashCommand(['JSON.GET', key])
        const raw = r && (r.result || r)
        if (!raw) continue
        let arr = []
        try { arr = JSON.parse(raw) } catch (e) { if (Array.isArray(raw)) arr = raw.map(p=>JSON.parse(p)) }
        // find latest prediction for this user
        const userPreds = arr.filter(p => (p.user || p.email) === userEmail)
        if (userPreds.length > 0) {
          const last = userPreds[userPreds.length-1]
          result[id] = { home: last.homeGoals, away: last.awayGoals }
        }
      } catch (e) {
        try {
          const r2 = await upstashCommand(['LRANGE', key, '0', '-1'])
          const arr = r2 && (r2.result || r2) || []
          const parsed = arr.map(x=>JSON.parse(x))
          const userPreds = parsed.filter(p => (p.user || p.email) === userEmail)
          if (userPreds.length > 0) {
            const last = userPreds[userPreds.length-1]
            result[id] = { home: last.homeGoals, away: last.awayGoals }
          }
        } catch (e2) {
          continue
        }
      }
    }

    return res.json({ predictions: result })
  }

  res.status(405).end()
}
