export async function upstashFetch(path, options = {}) {
  const base = process.env.UPSTASH_REST_URL
  const url = `${base}${path}`
  const token = process.env.UPSTASH_REST_TOKEN
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
  const res = await fetch(url, { headers, ...options })
  return res.json()
}

// Run a single Redis command via Upstash REST /v1/commands
export async function upstashCommand(cmd) {
  const base = process.env.UPSTASH_REST_URL
  if (!base) throw new Error('UPSTASH_REST_URL not configured')
  const token = process.env.UPSTASH_REST_TOKEN
  const payload = JSON.stringify({ commands: [cmd] })

  // Try the v1 commands endpoint first, then fall back to the older /commands path
  const tryEndpoints = [`${base}/v1/commands`, `${base}/commands`]
  let lastErr = null
  for (const url of tryEndpoints) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: payload })
      const json = await res.json()
      // If Upstash returns an error shape, surface it so caller can decide to fallback
      if (json && json.error) {
        lastErr = new Error(json.error || JSON.stringify(json))
        continue
      }
      return json
    } catch (e) {
      lastErr = e
      continue
    }
  }
  throw lastErr || new Error('Upstash command failed')
}

export async function upstashListPush(key, value) {
  const base = process.env.UPSTASH_REST_URL
  if (!base) throw new Error('UPSTASH_REST_URL not configured')
  const token = process.env.UPSTASH_REST_TOKEN
  const url = `${base}/rpush/${encodeURIComponent(key)}`
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify([value]) })
  return res.json()
}

export async function upstashListRange(key, start = 0, stop = -1) {
  const base = process.env.UPSTASH_REST_URL
  if (!base) throw new Error('UPSTASH_REST_URL not configured')
  const token = process.env.UPSTASH_REST_TOKEN
  const url = `${base}/lrange/${encodeURIComponent(key)}/${start}/${stop}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}

export async function upstashSet(key, value) {
  const base = process.env.UPSTASH_REST_URL
  if (!base) throw new Error('UPSTASH_REST_URL not configured')
  const token = process.env.UPSTASH_REST_TOKEN
  const url = `${base}/set/${encodeURIComponent(key)}`
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(value) })
  return res.json()
}
