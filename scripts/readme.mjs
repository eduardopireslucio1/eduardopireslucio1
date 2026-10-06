// Writes README.md in the portfolio's terminal style, with this year's GitHub contributions drawn as
// bits: 1 = contributed that day, 0 = didn't, · = still to come. Runs daily in .github/workflows/readme.yml.
// Locally: GH_TOKEN=<a GitHub token> node scripts/readme.mjs
import { writeFile } from 'node:fs/promises';

const USER = 'eduardopireslucio1';
const OUT = new URL('../README.md', import.meta.url);

async function contributions(year, token) {
  const query = `query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
      }
    }
  }`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': USER },
    body: JSON.stringify({
      query,
      variables: { login: USER, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
    }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(JSON.stringify(body.errors ?? body));
  const calendar = body.data.user.contributionsCollection.contributionCalendar;
  const days = {};
  for (const week of calendar.weeks) for (const d of week.contributionDays) days[d.date] = d.contributionCount;
  return { total: calendar.totalContributions, days };
}

// The year GitHub-style: a column per week (Sunday first), a row per weekday, month names on top.
export function calendar(year, days, today) {
  const offset = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const rows = Array.from({ length: 7 }, () => []);
  const months = [];
  const order = [];
  for (let i = 0; ; i++) {
    const d = new Date(Date.UTC(year, 0, 1 + i));
    if (d.getUTCFullYear() !== year) break;
    const key = d.toISOString().slice(0, 10);
    const week = Math.floor((i + offset) / 7);
    rows[d.getUTCDay()][week] = key > today ? '·' : days[key] ? '1' : '0';
    if (key <= today) order.push(days[key] ?? 0);
    if (d.getUTCDate() === 1) months.push([week, d.toLocaleString('en', { month: 'short', timeZone: 'UTC' }).toLowerCase()]);
  }

  const width = Math.max(...rows.map((r) => r.length));
  const header = Array(width).fill(' ');
  for (const [week, name] of months) [...name].forEach((ch, k) => week + k < width && (header[week + k] = ch));
  const gutter = ['    ', 'mon ', '    ', 'wed ', '    ', 'fri ', '    '];
  const lines = [`    ${header.join('').trimEnd()}`, ...rows.map((r, i) => gutter[i] + Array.from({ length: width }, (_, k) => r[k] ?? ' ').join('').trimEnd())];

  let streak = 0;
  let run = 0;
  for (const n of order) {
    run = n ? run + 1 : 0;
    streak = Math.max(streak, run);
  }
  return { lines, active: order.filter(Boolean).length, streak };
}

function best(days) {
  const [date, count] = Object.entries(days).reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0]);
  const label = new Date(`${date}T00:00:00Z`).toLocaleString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toLowerCase();
  return `${label} (${count})`;
}

const binary = (text) => [...new TextEncoder().encode(text)].map((b) => b.toString(2).padStart(8, '0')).join(' ');

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('Set GITHUB_TOKEN or GH_TOKEN (locally: GH_TOKEN=<a GitHub token>)');
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const { total, days } = await contributions(year, token);
  // a token that can't see private contribution counts reads 0: keep the last good README instead
  if (!total) return console.log('no contributions visible, README left as is');
  const cal = calendar(year, days, today);

  const readme = `\`\`\`console
$ whoami
eduardo pires lucio
software engineer @ predialize · building eventosxp · cyclist

$ cat now
building ai agents and ai workflows

$ cat contributions/${year}
${total} contributions · ${cal.active} active days · longest streak ${cal.streak} · best day ${best(days)}

$ cal ${year}        # one bit per day · 1 = shipped something
${cal.lines.join('\n')}

$ ls ~/
predialize/   post-construction platform for builders · angular · node microservices
eventosxp/    white-label platform for sports events · react · nestjs · postgres
ride/         road · time trial

$ ping
linkedin.com/in/eduardopireslucio · strava.com/athletes/3400462 · eventosxp.com.br

${binary('Eduardo')}
\`\`\`
`;
  await writeFile(OUT, readme);
  console.log(`README: ${total} contributions, ${cal.active} active days`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
