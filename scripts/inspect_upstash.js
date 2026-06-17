// Simple inspector for Upstash keys used by the app
// load .env.local if present
const fs = require('fs')
const path = require('path')
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8')
  raw.split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/i)
    if (m) {
      const k = m[1]
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      process.env[k] = v
    }
  })
}
const { upstashCommand } = require('../lib/upstash')
const fs2 = fs
const path2 = path

async function inspect() {
  try {
    console.log('Fetching matches from Upstash GET matches')
    try {
      const m = await upstashCommand(['GET', 'matches'])
      console.log('matches GET response:', JSON.stringify(m))
    } catch (e) { console.error('matches GET failed', e.message) }

    for (let id = 1; id <= 5; id++) {
      const key = `predictions:${id}`
      // try JSON.GET, then LRANGE, then RPUSH-style list
      try {
        const r = await upstashCommand(['JSON.GET', key])
        console.log(`${key} JSON.GET =>`, JSON.stringify(r))
        continue
      } catch (e) {}
      try {
        const r2 = await upstashCommand(['LRANGE', key, '0', '-1'])
        if (Array.isArray(r2) && r2.length) {
          console.log(`${key} LRANGE =>`, JSON.stringify(r2))
          continue
        }
      } catch (e) {}
      try {
        const r3 = await upstashCommand(['GET', key])
        if (r3) {
          console.log(`${key} GET =>`, JSON.stringify(r3))
          continue
        }
      } catch (e) {}
      console.log(`${key} not found`)
    }
  } catch (err) {
    console.error('inspect error', err)
  }
}

inspect()
