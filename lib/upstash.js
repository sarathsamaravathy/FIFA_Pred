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
  const url = `${base}/v1/commands`
  const token = process.env.UPSTASH_REST_TOKEN
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ commands: [cmd] }) })
  return res.json()
}
