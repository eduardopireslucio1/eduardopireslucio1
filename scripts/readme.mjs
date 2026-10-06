// Writes assets/contributions.svg (this year's GitHub contributions as bits, in the portfolio's style)
// and README.md around it. Runs daily in .github/workflows/readme.yml.
// Locally: GH_TOKEN=<a GitHub token> node scripts/readme.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const USER = 'eduardopireslucio1';
const ROOT = new URL('../', import.meta.url);

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

// Every day of the year GitHub-style: a column per week (Sunday first), a row per weekday.
export function yearCells(year, days, today) {
  const offset = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const cells = [];
  for (let i = 0; ; i++) {
    const d = new Date(Date.UTC(year, 0, 1 + i));
    if (d.getUTCFullYear() !== year) return cells;
    const key = d.toISOString().slice(0, 10);
    cells.push({ key, date: d, week: Math.floor((i + offset) / 7), weekday: d.getUTCDay(), count: days[key] ?? 0, future: key > today });
  }
}

export function summary(cells) {
  const past = cells.filter((c) => !c.future);
  let streak = 0;
  let run = 0;
  for (const c of past) {
    run = c.count ? run + 1 : 0;
    streak = Math.max(streak, run);
  }
  const best = past.reduce((a, b) => (b.count > a.count ? b : a), past[0]);
  return { active: past.filter((c) => c.count).length, streak, best };
}

const month = (d, style = 'short') => d.toLocaleString('en', { month: style, timeZone: 'UTC' }).toLowerCase();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// The portfolio's "year in bits": 1 = contributed that day (brighter with more), 0 = didn't, · = to come.
export function contributionsSvg({ year, total, cells, stats, font }) {
  const W = 1000;
  const X = 40;
  const GUTTER = 36;
  const CELL = (W - 2 * X - GUTTER) / 53;
  const TOP = 166;
  // GitHub-like levels: quartiles of the days that had anything
  const counts = cells.filter((c) => c.count).map((c) => c.count).sort((a, b) => a - b);
  const q = (p) => counts[Math.floor(p * (counts.length - 1))] ?? 1;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (n) => (n ? 1 + cuts.filter((cut) => n > cut).length : 0);

  const glyphs = cells
    .map((c) => {
      const x = (X + GUTTER + (c.week + 0.5) * CELL).toFixed(1);
      const y = (TOP + (c.weekday + 0.72) * CELL).toFixed(1);
      const cls = c.future ? 'f' : `l${level(c.count)}`;
      const ch = c.future ? '·' : c.count ? '1' : '0';
      return `<text class="c ${cls}" x="${x}" y="${y}" style="animation-delay:${c.week * 24}ms">${ch}</text>`;
    })
    .join('');
  const months = cells
    .filter((c) => c.date.getUTCDate() === 1)
    .map((c) => `<text class="m" x="${(X + GUTTER + c.week * CELL).toFixed(1)}" y="${TOP - 8}">${month(c.date)}</text>`)
    .join('');
  const weekdays = [
    [1, 'mon'],
    [3, 'wed'],
    [5, 'fri'],
  ]
    .map(([wd, name]) => `<text class="m" x="${X}" y="${(TOP + (wd + 0.72) * CELL).toFixed(1)}">${name}</text>`)
    .join('');

  const tiles = [
    [total.toLocaleString('en-US').replace(/,/g, ' '), 'contributions'],
    [stats.active, 'active days'],
    [stats.streak, 'longest streak · days'],
    [`${month(stats.best.date)} ${stats.best.date.getUTCDate()}`, `best day · ${stats.best.count}`],
  ]
    .map(([value, label], i) => {
      const x = X + i * ((W - 2 * X) / 4);
      return `<line class="rule" x1="${x}" x2="${x + (W - 2 * X) / 4 - 24}" y1="58" y2="58"/>` +
        `<text class="n" x="${x}" y="102">${esc(value)}</text><text class="k" x="${x}" y="124">${esc(label)}</text>`;
    })
    .join('');
  const legend = ['0', '1', '1', '1', '1']
    .map((ch, i) => `<text class="l${i}" x="${W - X - 104 + i * 12}" y="314">${ch}</text>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 336" width="${W}" height="336" role="img" aria-label="${total} contributions in ${year}, one bit per day">
<style>
@font-face { font-family: JBM; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 100 800; }
text { font-family: JBM, ui-monospace, Menlo, Consolas, monospace; }
.bg { fill: #030304; }
.kick { font-size: 10px; letter-spacing: .16em; fill: #6c727c; }
.rule { stroke: rgba(255, 255, 255, .08); }
.n { font-size: 34px; font-weight: 300; letter-spacing: -.03em; fill: #d7dbe0; }
.k, .m { font-size: 9.5px; letter-spacing: .14em; fill: #6c727c; }
.k { text-transform: uppercase; }
.c { font-size: 12px; text-anchor: middle; opacity: 0; animation: in .6s ease-out forwards; }
.f { fill: #1d2026; }
.l0 { fill: #2b3038; }
.l1 { fill: rgba(255, 122, 43, .42); }
.l2 { fill: rgba(255, 122, 43, .68); }
.l3 { fill: #ff7a2b; }
.l4 { fill: #ffb27f; filter: url(#glow); }
.foot { font-size: 10.5px; fill: #6c727c; }
@keyframes in { 0% { opacity: 0; } 35% { opacity: 1; fill: #fff; } 100% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .c { animation: none; opacity: 1; } }
</style>
<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect class="bg" width="${W}" height="336" rx="6"/>
<circle cx="${X + 3.5}" cy="30.5" r="3.5" fill="#ff7a2b" filter="url(#glow)"/>
<text class="kick" x="${X + 16}" y="34">${year} · GITHUB IN BITS</text>
${tiles}
${months}${weekdays}${glyphs}
<text class="foot" x="${X}" y="314">&gt; one bit per day · 1 = shipped something</text>
<text class="foot" x="${W - X - 140}" y="314">less</text>${legend}<text class="foot" x="${W - X - 40}" y="314">more</text>
</svg>
`;
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('Set GITHUB_TOKEN or GH_TOKEN (locally: GH_TOKEN=<a GitHub token>)');
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const { total, days } = await contributions(year, token);
  // a token that can't see private contribution counts reads 0: keep the last good files instead
  if (!total) return console.log('no contributions visible, files left as is');

  const cells = yearCells(year, days, today);
  const stats = summary(cells);
  const font = (await readFile(new URL('assets/jetbrains-mono.woff2', ROOT))).toString('base64');
  await writeFile(new URL('assets/contributions.svg', ROOT), contributionsSvg({ year, total, cells, stats, font }));

  const readme = `<img src="assets/hero.webp" alt="Eduardo Pires Lucio, a portrait made of a few thousand bits" width="100%">

<img src="assets/contributions.svg" alt="${total} contributions in ${year}, one bit per day" width="100%">

\`\`\`console
$ cat now
building ai agents and ai workflows · software engineer @ predialize · building eventosxp
\`\`\`

[linkedin](https://www.linkedin.com/in/eduardopireslucio/) · [strava](https://www.strava.com/athletes/3400462) · [eventosxp](https://www.eventosxp.com.br/)
`;
  await writeFile(new URL('README.md', ROOT), readme);
  console.log(`README: ${total} contributions, ${stats.active} active days`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
