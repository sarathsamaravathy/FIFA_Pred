import { upstashCommand } from '../../../../lib/upstash'
import fs from 'fs'
import path from 'path'

// Return all predictions (past and future) made by a given user email
export default async function handler(req, res) {
  try {
    const userParam = req.query.user
    if (!userParam) return res.status(400).json({ error: 'missing user' })
    const userEmail = decodeURIComponent(userParam)

    // load matches
    const matchesPath = path.join(process.cwd(), 'data', 'matches.json')
    const matches = fs.existsSync(matchesPath) ? JSON.parse(fs.readFileSync(matchesPath, 'utf8')) : []

    // try local seeded predictions first
    const seededPath = path.join(process.cwd(), 'data', 'seeded_predictions.json')
    let seeded = {}
    if (fs.existsSync(seededPath)) seeded = JSON.parse(fs.readFileSync(seededPath, 'utf8'))

    const results = []

    for (const m of matches) {
      const id = m.fifa_id || m.id
      let predsRaw = null
      // check seeded
      if (seeded && seeded[id]) predsRaw = seeded[id]

      // fallback to Upstash lists if available
      if (!predsRaw && process.env.UPSTASH_REST_URL && process.env.UPSTASH_REST_TOKEN) {
        try {
          const r = await upstashCommand(['LRANGE', `predictions:${id}`, '0', '-1'])
          if (r) {
            if (r.results && Array.isArray(r.results) && r.results[0] && typeof r.results[0].result !== 'undefined') predsRaw = r.results[0].result
            else if (typeof r.result !== 'undefined') predsRaw = r.result
            else predsRaw = r
          }
        } catch (e) {
          predsRaw = null
        }
      }

      if (!predsRaw) continue

      let preds = []
      if (typeof predsRaw === 'string') {
        try { preds = JSON.parse(predsRaw) } catch (e) { preds = [] }
      } else if (Array.isArray(predsRaw)) {
        preds = predsRaw.map(p => (typeof p === 'string' ? JSON.parse(p) : p))
      } else if (predsRaw && predsRaw.result) {
        try { preds = JSON.parse(predsRaw.result) } catch (e) { preds = [] }
      }

      for (const p of preds) {
        const email = p.user || p.email || ''
        if (!email) continue
        if (String(email).toLowerCase() === String(userEmail).toLowerCase()) {
          results.push({ match: m, prediction: p })
        }
      }
    }

    return res.json({ user: userEmail, predictions: results })
  } catch (err) {
    console.error('user predictions error', err)
    res.status(500).json({ error: 'Failed to load user predictions' })
  }
}
