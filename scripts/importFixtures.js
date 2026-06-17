const fs = require('fs')
const path = require('path')

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

const arg = process.argv[2]
const defaultPath = path.resolve(process.env.HOME || process.env.USERPROFILE || '.', 'Downloads', 'world-cup-2026-fixtures.json')
const fixturesPath = arg ? path.resolve(arg) : defaultPath

if (!fs.existsSync(fixturesPath)) {
  console.error('Fixtures file not found:', fixturesPath)
  process.exit(1)
}

const raw = readJSON(fixturesPath)
let fixtures = []
if (Array.isArray(raw)) fixtures = raw
else if (raw.fixtures && Array.isArray(raw.fixtures)) fixtures = raw.fixtures
else {
  console.error('No fixtures array found in file')
  process.exit(2)
}

const mapped = fixtures.map(f => ({
  id: f.matchNumber || f.id || null,
  fifa_id: f.matchNumber || f.id || null,
  datetime: f.kickoffUtc || f.datetime || f.date,
  home_team: { country: f.homeTeam },
  away_team: { country: f.awayTeam },
  stage_name: f.stage || f.stage_name || '',
}))

const outDir = path.resolve(process.cwd(), 'data')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir)
const outPath = path.join(outDir, 'matches.json')
fs.writeFileSync(outPath, JSON.stringify(mapped, null, 2), 'utf8')
console.log('Imported', mapped.length, 'fixtures to', outPath)

// Optionally update Upstash if env is present
if (process.env.UPSTASH_REST_URL && process.env.UPSTASH_REST_TOKEN) {
  (async () => {
    const url = `${process.env.UPSTASH_REST_URL.replace(/\/$/, '')}/v1`
    const body = JSON.stringify({ commands: [["SET", "matches", JSON.stringify(mapped)]] })
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.UPSTASH_REST_TOKEN}` }, body })
    const j = await res.json()
    console.log('Upstash response', j)
  })()
}
