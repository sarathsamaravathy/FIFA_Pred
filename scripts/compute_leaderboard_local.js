const fs = require('fs')
const path = require('path')

function calcPoints(match, pred) {
  let points = 0
  const isKnockout = match.stage_name && match.stage_name !== 'Group'
  const isFinal = match.stage_name === 'Final'
  const winner = match.home_team.goals > match.away_team.goals ? 'home' : match.home_team.goals < match.away_team.goals ? 'away' : 'draw'
  const predWinner = pred.winner
  if (predWinner === winner) points += 1
  if (pred.homeGoals === match.home_team.goals) points += 2
  if (pred.awayGoals === match.away_team.goals) points += 2
  if (isFinal) points *= 5
  else if (isKnockout) points *= 2
  return points
}

async function main() {
  const matchesPath = path.join(process.cwd(), 'data', 'matches.json')
  const seededPath = path.join(process.cwd(), 'data', 'seeded_predictions.json')
  if (!fs.existsSync(matchesPath)) return console.error('matches.json missing')
  const matches = JSON.parse(fs.readFileSync(matchesPath,'utf8'))
  const seeded = fs.existsSync(seededPath) ? JSON.parse(fs.readFileSync(seededPath,'utf8')) : {}
  const scores = {}
  for (const m of matches) {
    const id = m.fifa_id || m.id
    if (m.home_team?.goals == null || m.away_team?.goals == null) continue
    const preds = (seeded && seeded[id]) || []
    for (const p of preds) {
      const user = p.user || p.email || p.name || 'anon'
      const name = p.name || p.user || 'anon'
      const pts = calcPoints(m, p)
      if (!scores[user]) scores[user] = { user, name, points: 0 }
      scores[user].points += pts
    }
  }
  const arr = Object.values(scores).sort((a,b)=>b.points - a.points)
  console.log(JSON.stringify({ leaderboard: arr }, null, 2))
}

main()
