const fs = require('fs')
const path = require('path')

function loadDotEnv(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8')
    txt.split(/\r?\n/).forEach(line => {
      line = line.trim()
      if (!line || line.startsWith('#')) return
      const eq = line.indexOf('=')
      if (eq === -1) return
      const key = line.slice(0, eq).trim()
      let val = line.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    })
  } catch (e) {
    // ignore
  }
}

// load .env.local if present so users don't need dotenv installed
loadDotEnv(path.resolve(process.cwd(), '.env.local'))

const UPSTASH_REST_URL = process.env.UPSTASH_REST_URL || process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_REST_TOKEN = process.env.UPSTASH_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

if (!UPSTASH_REST_URL || !UPSTASH_REST_TOKEN) {
  console.error('Missing UPSTASH_REST_URL or UPSTASH_REST_TOKEN in environment or .env.local')
  process.exit(1)
}

async function main() {
  console.log('Fetching matches from worldcupjson.net')
  const res = await fetch('https://worldcupjson.net/v1/matches', { headers: { Accept: 'application/json', 'User-Agent': 'node.js sync script' } })
  const data = await res.json()
  if (!res.ok || !Array.isArray(data)) {
    console.error('Upstream error:', data)
    process.exit(2)
  }

  console.log('Storing matches to Upstash...')
  const url = `${UPSTASH_REST_URL.replace(/\/$/, '')}/v1`
  const body = JSON.stringify({ commands: [["SET", "matches", JSON.stringify(data)]] })
  const put = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UPSTASH_REST_TOKEN}` }, body })
  const result = await put.json()
  console.log('Upstash response:', result)
  if (put.ok) console.log('Sync complete.')
  else process.exit(3)
}

main().catch(err => { console.error(err); process.exit(4) })
