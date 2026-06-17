import fs from 'fs'
import path from 'path'
import { upstashCommand, upstashSet } from '../../../../lib/upstash'
import { getSession } from 'next-auth/react'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'sarathsamaravathy@gmail.com').split(',').map(s=>s.trim().toLowerCase())

export default async function handler(req, res) {
  const {
    query: { id },
    method,
    body,
  } = req

  const dataPath = path.join(process.cwd(), 'data', 'matches.json')
  if (!fs.existsSync(dataPath)) return res.status(404).json({ error: 'No local matches found' })
  const raw = fs.readFileSync(dataPath, 'utf8')
  let matches = JSON.parse(raw)

  const idx = matches.findIndex(m => String(m.fifa_id || m.id) === String(id))
  if (idx === -1) return res.status(404).json({ error: 'Match not found' })
  // auth: only allow configured admin emails
  const session = await getSession({ req })
  const email = session?.user?.email?.toLowerCase()
  if (!session || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: 'Forbidden' })

  if (method === 'PATCH') {
    const allowed = ['datetime', 'home_team', 'away_team', 'stage_name']
    for (const k of Object.keys(body)) {
      if (allowed.includes(k)) {
        matches[idx][k] = body[k]
      }
    }
    // allow setting results via body.home_goals / body.away_goals or nested body.home_team.goals
    if (typeof body.home_goals !== 'undefined' || (body.home_team && typeof body.home_team.goals !== 'undefined')) {
      matches[idx].home_team = matches[idx].home_team || {}
      matches[idx].home_team.goals = Number(typeof body.home_goals !== 'undefined' ? body.home_goals : body.home_team.goals)
    }
    if (typeof body.away_goals !== 'undefined' || (body.away_team && typeof body.away_team.goals !== 'undefined')) {
      matches[idx].away_team = matches[idx].away_team || {}
      matches[idx].away_team.goals = Number(typeof body.away_goals !== 'undefined' ? body.away_goals : body.away_team.goals)
    }
    if (body.status) {
      matches[idx].status = body.status
    }
    fs.writeFileSync(dataPath, JSON.stringify(matches, null, 2), 'utf8')
    // also update Upstash cache if available. Use per-command SET endpoint when possible.
    if (process.env.UPSTASH_REST_URL && process.env.UPSTASH_REST_TOKEN) {
      try {
        await upstashSet('matches', JSON.stringify(matches))
      } catch (e) {
        try {
          await upstashCommand(['SET', 'matches', JSON.stringify(matches)])
        } catch (e2) {
          console.warn('Upstash update failed', e2)
          return res.status(500).json({ success: false, error: 'Failed to update Upstash cache' })
        }
      }
    }
    return res.json({ success: true })
  }

  res.setHeader('Allow', ['PATCH'])
  res.status(405).end(`Method ${method} Not Allowed`)
}
