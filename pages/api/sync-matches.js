import { upstashCommand } from '../../lib/upstash'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const r = await fetch('https://worldcupjson.net/v1/matches')
    if (!r.ok) return res.status(r.status).json({ error: 'Upstream error' })
    const data = await r.json()
    if (process.env.UPSTASH_REST_URL && process.env.UPSTASH_REST_TOKEN) {
      await upstashCommand(['SET', 'matches', JSON.stringify(data)])
    }
    return res.json({ success: true })
  } catch (err) {
    console.error('sync error', err)
    return res.status(500).json({ error: 'sync failed' })
  }
}
