// Deletes local seeded_predictions.json and removes corresponding Upstash keys
const fs = require('fs')
const path = require('path')
const { upstashCommand } = require('../lib/upstash')

// load .env.local
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

async function clear() {
  const seededPath = path.join(process.cwd(), 'data', 'seeded_predictions.json')
  if (!fs.existsSync(seededPath)) {
    console.log('No seeded file found at', seededPath)
    return
  }
  const seeded = JSON.parse(fs.readFileSync(seededPath, 'utf8'))
  const keys = Object.keys(seeded)
  console.log('Found seeded prediction keys:', keys.join(', '))

  if (process.env.UPSTASH_REST_URL && process.env.UPSTASH_REST_TOKEN) {
    for (const id of keys) {
      const key = `predictions:${id}`
      try {
        await upstashCommand(['DEL', key])
        console.log('Deleted Upstash key', key)
      } catch (e) {
        console.warn('Failed to delete', key, e?.message || e)
      }
    }
  } else {
    console.log('UPSTASH credentials missing; skipping Upstash deletes')
  }

  // delete local file
  try {
    fs.unlinkSync(seededPath)
    console.log('Removed', seededPath)
  } catch (e) {
    console.warn('Failed to remove local seeded file', e.message)
  }
}

clear().catch(e=>{ console.error('clear failed', e); process.exit(1) })
