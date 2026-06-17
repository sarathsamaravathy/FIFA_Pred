// load .env.local manually if present
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
      // strip surrounding quotes
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env[k] = v
    }
  })
}

const { upstashCommand } = require('../lib/upstash')

async function seed() {
  try {
    // sample predictions for matches 1,2,3
    const preds1 = [
      { user: 'sarathsamaravathy@gmail.com', name: 'Sarath S', homeGoals: 2, awayGoals: 1, winner: 'home', ts: new Date().toISOString() },
      { user: 'sarathspillai@gmail.com', name: 'Sarath P', homeGoals: 3, awayGoals: 1, winner: 'home', ts: new Date().toISOString() }
    ]
    const preds2 = [
      { user: 'sarahsamaravathy@gmail.com', name: 'Sarah', homeGoals: 1, awayGoals: 1, winner: 'draw', ts: new Date().toISOString() },
      { user: 'sarathspillai@gmail.com', name: 'Sarath', homeGoals: 2, awayGoals: 1, winner: 'home', ts: new Date().toISOString() }
    ]
    const preds3 = [
      { user: 'sarahsamaravathy@gmail.com', name: 'Sarah', homeGoals: 3, awayGoals: 0, winner: 'home', ts: new Date().toISOString() },
      { user: 'sarathspillai@gmail.com', name: 'Sarath', homeGoals: 2, awayGoals: 0, winner: 'home', ts: new Date().toISOString() }
    ]

    console.log('Writing predictions to Upstash (RPUSH lists)...')
    // clear existing lists
    await upstashCommand(['DEL', 'predictions:1']).catch(()=>{})
    await upstashCommand(['DEL', 'predictions:2']).catch(()=>{})
    await upstashCommand(['DEL', 'predictions:3']).catch(()=>{})
    for (const p of preds1) await upstashCommand(['RPUSH', 'predictions:1', JSON.stringify(p)])
    for (const p of preds2) await upstashCommand(['RPUSH', 'predictions:2', JSON.stringify(p)])
    for (const p of preds3) await upstashCommand(['RPUSH', 'predictions:3', JSON.stringify(p)])
    // also write local copy for dev fallback
    const out = {
      '1': preds1,
      '2': preds2,
      '3': preds3
    }
    const outPath = path.join(process.cwd(), 'data', 'seeded_predictions.json')
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8')
    console.log('Seed complete (also wrote', outPath, ')')
  } catch (e) {
    console.error('Seed failed', e)
    process.exit(1)
  }
}

seed()
