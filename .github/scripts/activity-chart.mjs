// Generates assets/activity-chart.svg: daily contributions (commits and other activity) over the last DAYS days.
// Usage: GH_TOKEN=<token> GH_USER=<login> node .github/scripts/activity-chart.mjs
import { writeFileSync } from "node:fs";

const token = process.env.GH_TOKEN;
const login = process.env.GH_USER || "Shuh3n";
const out = process.env.OUT || "assets/activity-chart.svg";
if (!token) throw new Error("GH_TOKEN is required");

const DAYS = 60;
const DAY = 86_400_000;
const now = Date.now();
const from = new Date(now - (DAYS + 7) * DAY).toISOString();
const to = new Date(now).toISOString();

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection(from: "${from}", to: "${to}") {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(`GraphQL failed: ${JSON.stringify(json.errors ?? json)}`);

const allDays = json.data.user.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
const today = new Date(now).toISOString().slice(0, 10);
const days = allDays.filter((d) => d.date <= today).slice(-DAYS).map((d) => ({ date: d.date, total: d.contributionCount }));
const weeks = days; // one point per day
const N = days.length;
const total = days.reduce((s, d) => s + d.total, 0);
const avg = Math.round(total / N);
const peakIdx = days.reduce((best, d, i) => (d.total > days[best].total ? i : best), 0);

// Layout
const W = 900, H = 330;
const L = 52, R = 28, T = 78, B = 44;
const plotW = W - L - R, plotH = H - T - B;
const rawMax = Math.max(1, ...weeks.map((w) => w.total));
const step = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((s) => rawMax / s <= 4) ?? Math.ceil(rawMax / 4);
const yMax = Math.ceil(rawMax / step) * step;
const x = (i) => L + (i / (N - 1)) * plotW;
const y = (v) => T + plotH - (v / yMax) * plotH;

const clampY = (v) => Math.min(T + plotH, Math.max(T, v));
const f = (n) => n.toFixed(1);
function smooth(pts) {
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clampY(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clampY(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

const pts = weeks.map((w, i) => [x(i), y(w.total)]);
const linePath = smooth(pts);
const areaPath = `${linePath} L${f(x(N - 1))},${T + plotH} L${f(x(0))},${T + plotH} Z`;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const label = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const xLabels = days
  .map((d, i) => ({ d, i }))
  .filter(({ i }) => (N - 1 - i) % 10 === 0)
  .map(({ d, i }) => `<text x="${f(x(i))}" y="${H - 22}" text-anchor="middle" class="axis">${label(d.date)}</text>`)
  .join("");

const grid = Array.from({ length: yMax / step + 1 }, (_, k) => k * step)
  .map(
    (v) =>
      `<line x1="${L}" x2="${W - R}" y1="${f(y(v))}" y2="${f(y(v))}" class="grid"/>` +
      `<text x="${L - 10}" y="${f(y(v) + 4)}" text-anchor="end" class="axis">${v}</text>`,
  )
  .join("");

const last = pts[N - 1], peak = pts[peakIdx];
const peakAnchor = peak[0] > W - 120 ? "end" : peak[0] < L + 60 ? "start" : "middle";
const updated = new Date(now).toISOString().slice(0, 10);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gráfico de líneas de las contribuciones diarias de ${login} en los últimos ${DAYS} días">
  <defs>
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2488F8" stop-opacity="0.4"/>
      <stop offset="1" stop-color="#2488F8" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <style>
    text { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }
    .title { font-size: 18px; font-weight: 600; fill: #58a6ff; }
    .sub { font-size: 12px; fill: #8b949e; }
    .axis { font-size: 11px; fill: #8b949e; }
    .peak { font-size: 11px; fill: #c9d1d9; }
    .grid { stroke: #21262d; stroke-width: 1; }
    .avg { stroke: #8b949e; stroke-width: 1; stroke-dasharray: 4 4; opacity: 0.7; }
    .line { fill: none; stroke: #2488F8; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; animation: draw 2.4s ease-out; }
    .fade { animation: fade 2.4s ease-out; }
    .pulse { animation: pulse 2s ease-out infinite; transform-box: fill-box; transform-origin: center; }
    @keyframes draw { from { stroke-dashoffset: 1; } }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pulse { from { transform: scale(1); opacity: 0.7; } to { transform: scale(3); opacity: 0; } }
  </style>
  <rect width="${W}" height="${H}" rx="10" fill="#0d1117" stroke="#30363d"/>
  <text x="${L}" y="34" class="title">Commits y actividad</text>
  <text x="${L}" y="54" class="sub">${total} contribuciones en los últimos ${DAYS} días · promedio de ${avg} por día</text>
  ${grid}
  <line x1="${L}" x2="${W - R}" y1="${f(y(avg))}" y2="${f(y(avg))}" class="avg"/>
  <text x="${L + 6}" y="${f(y(avg) - 6)}" text-anchor="start" class="axis">promedio</text>
  ${xLabels}
  <path d="${areaPath}" fill="url(#area)" class="fade"/>
  <path d="${linePath}" pathLength="1" class="line" filter="url(#glow)"/>
  <circle cx="${f(peak[0])}" cy="${f(peak[1])}" r="4" fill="#0d1117" stroke="#58a6ff" stroke-width="2"/>
  <text x="${f(peak[0])}" y="${f(peak[1] - 12)}" text-anchor="${peakAnchor}" class="peak">pico: ${days[peakIdx].total} · ${label(days[peakIdx].date)}</text>
  <circle cx="${f(last[0])}" cy="${f(last[1])}" r="4" fill="#2488F8"/>
  <circle cx="${f(last[0])}" cy="${f(last[1])}" r="4" fill="#2488F8" class="pulse"/>
  <text x="${W - R}" y="${H - 5}" text-anchor="end" class="sub" style="font-size:10px">actualizado ${updated}</text>
</svg>
`;

writeFileSync(out, svg);
console.log(`Wrote ${out}: ${total} contributions over ${N} days, avg ${avg}, peak ${days[peakIdx].total}, yMax=${yMax}`);
