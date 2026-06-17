import { upstashCommand } from '../../lib/upstash'
import fs from 'fs'
import path from 'path'

// Simple circuit-breaker / cooldown to avoid hammering upstream when bot-protection is active
let lastUpstreamFailure = 0
const UPSTREAM_COOLDOWN_MS = 12 * 60 * 60 * 1000 // 12 hours

export default async function handler(req, res) {
  try {
    // If operator wants to force local-only mode (avoid upstream entirely)
    if (process.env.FORCE_LOCAL_MATCHES === '1' || String(process.env.FORCE_LOCAL_MATCHES).toLowerCase() === 'true') {
      const local = tryLocalMatches()
      if (local) return res.status(200).json(local)
      return res.status(502).json({ error: 'FORCE_LOCAL_MATCHES set but no local fallback available' })
    }
    // 1) Try Upstash cached value first (fast and avoids upstream)
    if (process.env.UPSTASH_REST_URL && process.env.UPSTASH_REST_TOKEN) {
      try {
        const cached = await upstashCommand(['GET', 'matches'])
        const val = cached && (cached.result || cached)
        if (val) {
          try {
            const parsed = JSON.parse(val)
            return res.status(200).json(parsed)
          } catch (e) {
            // ignore and continue to local fallback
          }
        }
      } catch (e) {
        // avoid noisy logs on every request
        console.debug('Upstash GET failed, will try local/upstream fallback')
      }
    }

    // 2) If upstream recently failed with bot-protection, use local fallback immediately
    const now = Date.now()
    if (lastUpstreamFailure && (now - lastUpstreamFailure) < UPSTREAM_COOLDOWN_MS) {
      const local = tryLocalMatches()
      if (local) return res.status(200).json(local)
      return res.status(502).json({ error: 'Upstream disabled due to repeated failures; no local fallback available' })
    }

    // 3) Attempt upstream fetch
    try {
      const r = await fetch('https://worldcupjson.net/v1/matches', { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })
      const data = await r.json().catch(() => null)
      if (!Array.isArray(data)) {
        // upstream returned an error (e.g. Imunify360 bot-protection)
        console.warn('Upstream returned non-array or error:', data)
        lastUpstreamFailure = Date.now()
        const local = tryLocalMatches()
        if (local) return res.status(200).json(local)
        return res.status(502).json({ error: data?.message || 'Upstream returned unexpected data and no local fallback found' })
      }

      // store to Upstash asynchronously if configured
      if (process.env.UPSTASH_REST_URL && process.env.UPSTASH_REST_TOKEN) {
        upstashCommand(['SET', 'matches', JSON.stringify(data)]).catch(err => console.warn('Upstash SET failed', err))
      }

      return res.status(200).json(data)
    } catch (e) {
      console.warn('Upstream fetch failed', e)
      lastUpstreamFailure = Date.now()
      const local = tryLocalMatches()
      if (local) return res.status(200).json(local)
      return res.status(502).json({ error: 'Failed to fetch upstream and no local fallback available' })
    }
  } catch (err) {
    console.error('Error fetching matches:', err)
    return res.status(500).json({ error: 'Failed to fetch matches' })
  }
}

function tryLocalMatches() {
  try {
    const localPath = path.join(process.cwd(), 'data', 'matches.json')
    if (fs.existsSync(localPath)) {
      const localRaw = fs.readFileSync(localPath, 'utf8')
      const localData = JSON.parse(localRaw)
      if (localData && Array.isArray(localData)) return localData
      if (localData && Array.isArray(localData.fixtures)) {
        const mapped = localData.fixtures.map(f => ({
          id: f.matchNumber,
          fifa_id: f.matchNumber,
          datetime: f.kickoffUtc || f.datetime || f.date,
          home_team: { country: f.homeTeam },
          away_team: { country: f.awayTeam },
          stage_name: f.stage || f.stage_name || 'group'
        }))
        return mapped
      }
    }
  } catch (e) {
    console.debug('Local fallback failed', e)
  }
  return null
}
