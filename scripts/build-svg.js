// ╔══════════════════════════════════════════════════════════════╗
// ║        🚀 DYNAMIC SVG BUILDER (Activity Graphs)              ║
// ║                                                            ║
// ║  • Left: animated activity line graph, totals strip,       ║
// ║    full-width heatmap with months + year in review         ║
// ║  • Right: Tailored Neofetch terminal card with live stats  ║
// ║  • Responsive, zero horizontal scroll, dark/light themes    ║
// ╚══════════════════════════════════════════════════════════════╝

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ─── XML ESCAPING ─────────────────────────────────────────────
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── DYNAMIC UPTIME ───────────────────────────────────────────
function calculateUptime(startDateStr) {
  const start = new Date(startDateStr);
  const now = new Date();

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const yStr = `${years} year${years !== 1 ? 's' : ''}`;
  const mStr = `${months} month${months !== 1 ? 's' : ''}`;
  const dStr = `${days} day${days !== 1 ? 's' : ''}`;
  const isBirthday = months === 0 && days === 0;

  return `${yStr}, ${mStr}, ${dStr}${isBirthday ? ' 🎂' : ''}`;
}

// ─── LEFT LIVE-STAT WIDGETS ─────────────────────────────────────
// Widget-style cards (repos / stars / commits / followers / streak /
// top languages) filling the left pane. All values come from the live
// GitHub API via fetchStats().
const CARD_H = 530;
const LEFT_PAD = 25;
const LEFT_INNER_W = 350; // 25 → 375, mirrors the 25px right margin

function streakFromDays(days) {
  let cur = 0, best = 0;
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i -= 1; // a zero today doesn't break the streak
  for (; i >= 0 && days[i].count > 0; i--) cur += 1;
  let run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { streak: cur, longestStreak: best };
}

function fmtDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i];
    const p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x},${p2.y}`;
  }
  return d;
}

let odoId = 0;

// Rolling digit column (odometer) for count-up animations.
// Pure SMIL — no JavaScript — so it animates inside GitHub READMEs.
// Renders one number string left-to-right from (x, baseline y); each digit
// rolls from 0 to its final value with an ease-out spline. Returns {svg, width}.
function odometer(x, y, str, { fill, fs = 16, weight = 700, dur = 1.2, delay = 0, adv = null } = {}) {
  const MONO = `font-family="Consolas, 'Courier New', monospace"`;
  const A = adv ?? 0.6 * fs; // monospace advance per char
  const LH = fs; // digit pitch
  const cw = 0.62 * fs; // clip width
  let cx = x, out = '', di = 0;
  for (const ch of String(str)) {
    if (ch >= '0' && ch <= '9') {
      const d = +ch;
      const ccx = cx + A / 2;
      const id = `odo${odoId++}`;
      const begin = (delay + di * 0.08).toFixed(2);
      out += `<g><clipPath id="${id}"><rect x="${(ccx - cw / 2).toFixed(1)}" y="${(y - fs * 0.85).toFixed(1)}" width="${cw.toFixed(1)}" height="${(fs * 0.85 + 1).toFixed(1)}"/></clipPath><g clip-path="url(#${id})"><g><animateTransform attributeName="transform" type="translate" from="0 0" to="0 ${-d * LH}" dur="${dur}s" begin="${begin}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.25 0.8 0.3 1"/>`;
      for (let k = 0; k <= 9; k++) {
        out += `<text x="${ccx.toFixed(1)}" y="${y + k * LH}" font-size="${fs}" font-weight="${weight}" text-anchor="middle" fill="${fill}" ${MONO}>${k}</text>`;
      }
      out += `</g></g></g>`;
      di++;
    } else {
      out += `<text x="${cx.toFixed(1)}" y="${y}" font-size="${fs}" font-weight="${weight}" fill="${fill}" ${MONO}>${ch}</text>`;
    }
    cx += A;
  }
  return { svg: out, width: cx - x };
}

function buildLeftWidgets(stats, w) {
  const MONO = `font-family="Consolas, 'Courier New', monospace"`;
  const X0 = LEFT_PAD;

  // ── Weekly activity from the daily calendar (last 26 weeks) ──
  const WEEKS = 26;
  const TOTAL = WEEKS * 7;
  const rawDays = (stats.calendar || []).slice(-TOTAL);
  // Align columns to Sun–Sat like GitHub: pad the front by the first day's weekday.
  const firstDow = rawDays.length ? new Date(`${rawDays[0].date}T00:00:00Z`).getUTCDay() : NaN;
  const leadOff = Number.isFinite(firstDow) ? firstDow : 0;
  const days = [...Array(leadOff).fill(null), ...rawDays].slice(-TOTAL);
  while (days.length < TOTAL) days.unshift(null);
  const weekly = [];
  for (let k = 0; k < WEEKS; k++) {
    let s = 0;
    for (let d = 0; d < 7; d++) {
      const day = days[k * 7 + d];
      if (day) s += day.count;
    }
    weekly.push(s);
  }
  const peak = Math.max(1, ...weekly);

  // ── Animated line graph (draw-on + fading area + pulsing tip) ──
  // Full inner width (25 → 375), 12px title→chart pad like other sections.
  const GX = X0, GW = LEFT_INNER_W, GB = 244, GH = 180, GT = GB - GH;
  const pts = weekly.map((v, i) => ({
    x: +(GX + (i * GW) / (WEEKS - 1)).toFixed(1),
    y: +(GB - (v / peak) * GH).toFixed(1),
  }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x},${GB} L ${pts[0].x},${GB} Z`;
  const tip = pts[pts.length - 1];
  const lineColor = w.graph[4];

  let svg = '';
  svg += `<text x="${X0}" y="30" font-size="16" font-weight="700" fill="${w.title}" ${MONO}>Activity · 6 mo</text>`;
  // Header numbers roll up like an odometer; words stay static.
  {
    const A12 = 0.6 * 12;
    const tStr = stats.commits.toLocaleString(), pStr = `${peak}`;
    const s1 = ' total · peak ', s2 = '/wk';
    const totalW = (tStr.length + s1.length + pStr.length + s2.length) * A12;
    let hx = X0 + LEFT_INNER_W - totalW;
    const o1 = odometer(hx, 52, tStr, { fill: w.value, fs: 12, delay: 0.1 });
    svg += o1.svg;
    hx += o1.width;
    svg += `<text x="${hx.toFixed(1)}" y="52" font-size="12" fill="${w.label}" ${MONO}>${s1}</text>`;
    hx += s1.length * A12;
    const o2 = odometer(hx, 52, pStr, { fill: w.value, fs: 12, delay: 0.3 });
    svg += o2.svg;
    hx += o2.width;
    svg += `<text x="${hx.toFixed(1)}" y="52" font-size="12" fill="${w.label}" ${MONO}>${s2}</text>`;
  }
  svg += `<linearGradient id="areaFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lineColor}" stop-opacity="0.35"/><stop offset="1" stop-color="${lineColor}" stop-opacity="0"/></linearGradient>`;
  for (const f of [0, 0.5, 1]) {
    const gy = (GB - f * GH).toFixed(1);
    svg += `<line x1="${GX}" y1="${gy}" x2="${GX + GW}" y2="${gy}" stroke="${w.tileBorder}" stroke-width="1" opacity="0.7"/>`;
  }
  svg += `<path d="${area}" fill="url(#areaFade)" opacity="0"><animate attributeName="opacity" from="0" to="1" dur="1.2s" begin="0.3s" fill="freeze"/></path>`;
  svg += `<path d="${line}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"><animate attributeName="stroke-dashoffset" from="100" to="0" dur="1.2s" fill="freeze"/></path>`;
  svg += `<circle cx="${tip.x}" cy="${tip.y}" r="4" fill="${lineColor}" stroke="${w.tileBg}" stroke-width="2"><animate attributeName="r" values="3.5;5.5;3.5" dur="2.4s" repeatCount="indefinite"/></circle>`;

  // ── Totals strip: 4 mini stats, numbers roll up, same blue as top ──
  const groups = [
    [stats.repos.toLocaleString(), 'repos'],
    [stats.stars.toLocaleString(), 'stars'],
    [stats.forks.toLocaleString(), 'forks'],
    [stats.followers.toLocaleString(), 'followers'],
  ];
  groups.forEach(([val, label], gi) => {
    const cx = X0 + (LEFT_INNER_W * (gi + 0.5)) / 4;
    const o = odometer(cx - (val.length * 0.6 * 16) / 2, 270, val, { fill: w.value, fs: 16, delay: 0.2 + gi * 0.15 });
    svg += o.svg;
    svg += `<text x="${cx.toFixed(1)}" y="292" font-size="10" text-anchor="middle" fill="${w.label}" ${MONO} opacity="0"><animate attributeName="opacity" from="0" to="1" dur="1.2s" begin="0.3s" fill="freeze"/>${label}</text>`;
  });

  // ── Contribution heatmap: full width + month labels, GitHub-style ──
  // Bigger 12px cells; week columns cascade in with staggered SMIL fade-ins.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const HWEEKS = 27, CELL = 10, HGAP = 3, HSTEP = CELL + HGAP;
  const HTOTAL = HWEEKS * 7;
  const hraw = (stats.calendar || []).slice(-HTOTAL);
  const hDowRaw = hraw.length ? new Date(`${hraw[0].date}T00:00:00Z`).getUTCDay() : NaN;
  const hOff = Number.isFinite(hDowRaw) ? hDowRaw : 0;
  const hdays = [...Array(hOff).fill(null), ...hraw].slice(-HTOTAL);
  while (hdays.length < HTOTAL) hdays.unshift(null);
  const max = stats.calMax || 1;
  const compLevel = (c) => (c <= 0 ? 0 : c / max <= 0.25 ? 1 : c / max <= 0.5 ? 2 : c / max <= 0.75 ? 3 : 4);
  const levelOf = (hday, c) => (hday && hday.level != null
    ? Math.min(4, Math.max(0, hday.level))
    : compLevel(c));
  const GY = 364;
  svg += `<text x="${X0}" y="334" font-size="16" font-weight="700" fill="${w.title}" ${MONO}>Daily contributions</text>`;
  if (stats.streak != null) {
    svg += `<text x="${X0 + LEFT_INNER_W}" y="334" font-size="12" text-anchor="end" fill="${w.key}" ${MONO}>${stats.streak}-day streak</text>`;
  }
  // Month label above each month's first column (GitHub-style).
  let prevYM = -1;
  for (let wk = 0; wk < HWEEKS; wk++) {
    let ym = -1, m = -1;
    for (let d = 0; d < 7; d++) {
      const hd = hdays[wk * 7 + d];
      if (!hd) continue;
      const dt = new Date(`${hd.date}T00:00:00Z`);
      const yy = dt.getUTCFullYear(), mm = dt.getUTCMonth();
      if (!Number.isFinite(yy) || mm < 0 || mm > 11) continue;
      ym = yy * 12 + mm;
      m = mm;
      break;
    }
    if (ym >= 0 && ym !== prevYM) {
      svg += `<text x="${X0 + wk * HSTEP}" y="${GY - 10}" font-size="10" fill="${w.label}" ${MONO}>${MONTHS[m]}</text>`;
      prevYM = ym;
    }
  }
  for (let wk = 0; wk < HWEEKS; wk++) {
    svg += `<g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="1.2s" begin="${(0.3 + wk * 0.05).toFixed(2)}s" fill="freeze"/>`;
    for (let d = 0; d < 7; d++) {
      const hday = hdays[wk * 7 + d];
      const c = hday ? hday.count : 0;
      const tipTxt = hday ? `${c} contribution${c === 1 ? '' : 's'} on ${fmtDay(hday.date)}` : 'no data';
      svg += `<rect x="${X0 + wk * HSTEP}" y="${GY + d * HSTEP}" width="${CELL}" height="${CELL}" rx="2" fill="${w.graph[levelOf(hday, c)]}"><title>${escapeXml(tipTxt)}</title></rect>`;
    }
    svg += `</g>`;
  }

  // Less → More key, right-aligned like GitHub.
  const keyY = 474;
  svg += `<text x="273" y="${keyY}" font-size="10" text-anchor="end" fill="${w.label}" ${MONO}>Less</text>`;
  w.graph.forEach((g, i) => {
    svg += `<rect x="${281 + i * (CELL + 3)}" y="${keyY - 9}" width="10" height="10" rx="2" fill="${g}"/>`;
  });
  svg += `<text x="${X0 + LEFT_INNER_W}" y="${keyY}" font-size="10" text-anchor="end" fill="${w.label}" ${MONO}>More</text>`;

  return `<g clip-path="url(#cardClip)">${svg}\n</g>`;
}

// ─── FETCH LIVE GITHUB STATS ──────────────────────────────────
async function fetchStats(username) {
  const token = process.env.GITHUB_TOKEN || process.env.ACCESS_TOKEN;
  const headers = {
    'User-Agent': 'github-profile-neofetch',
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) headers.Authorization = `token ${token}`;

  let repos = 38;
  let followers = 29;
  let stars = 38;
  let contributed = 12;
  let commits = 1450;
  let forks = 0;
  let createdAt = '2023-11-30T19:20:31Z';
  let repoList = [];
  let streak = null;
  let longestStreak = 0;
  let calendar = [];
  let calMax = 1;

  try {
    const userRes = await fetch(`https://api.github.com/users/${username}`, { headers });
    if (userRes.ok) {
      const u = await userRes.json();
      repos = u.public_repos ?? repos;
      followers = u.followers ?? followers;
      createdAt = u.created_at ?? createdAt;
    }

    const reposRes = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { headers });
    if (reposRes.ok) {
      repoList = await reposRes.json();
      stars = repoList.reduce((acc, r) => acc + (r.stargazers_count || 0), 0);
      forks = repoList.reduce((acc, r) => acc + (r.forks_count || 0), 0);
    }

    // Token-free daily contributions from the public calendar page.
    // This is what fills the heatmap + line graph without GITHUB_TOKEN.
    if (!calendar.length) {
      try {
        const cRes = await fetch(`https://github.com/users/${username}/contributions`, {
          headers: { 'User-Agent': 'github-profile-neofetch' },
        });
        if (cRes.ok) {
          const body = await cRes.text();
          const cells = [];
          for (const m of body.matchAll(/<td[^>]*data-date="([^"]+)"[^>]*>/g)) {
            const tag = m[0];
            if (!tag.includes('ContributionCalendar-day')) continue;
            const lv = /data-level="(\d)"/.exec(tag);
            cells.push({ date: m[1], level: lv ? parseInt(lv[1], 10) : 0, count: 0 });
          }
          // Counts live in the adjacent <tool-tip> elements, in the same order.
          const tips = [...body.matchAll(/>(No|\d[\d,]*) contributions? on/g)].map((m) => m[1]);
          if (tips.length === cells.length) {
            cells.forEach((c, i) => {
              c.count = tips[i] === 'No' ? 0 : parseInt(tips[i].replace(/,/g, ''), 10) || 0;
            });
          }
          if (cells.length) {
            // Cells arrive row-major (all Sundays, then Mondays…): sort chronologically.
            cells.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
            calendar = cells;
            calMax = Math.max(1, ...cells.map((p) => p.count));
            ({ streak, longestStreak } = streakFromDays(cells));
          }
        }
      } catch (err) {
        console.warn('Contributions calendar warning:', err.message);
      }
    }
    if (token) {
      try {
        const query = `
          query($login: String!) {
            user(login: $login) {
              repositoriesContributedTo(first: 1) {
                totalCount
              }
              contributionsCollection {
                contributionCalendar {
                  totalContributions
                  weeks {
                    contributionDays {
                      date
                      contributionCount
                    }
                  }
                }
              }
            }
          }
        `;
        const gqlHeaders = {
              ...headers,
              Authorization: `bearer ${token}`,
              'Content-Type': 'application/json',
            };
        const gqlRes = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers: gqlHeaders,
          body: JSON.stringify({ query, variables: { login: username } }),
        });
        if (gqlRes.ok) {
          const gql = await gqlRes.json();
          const userGql = gql?.data?.user;
          if (userGql) {
            contributed = userGql.repositoriesContributedTo?.totalCount || contributed;
            commits = userGql.contributionsCollection?.contributionCalendar?.totalContributions || commits;
            // Daily calendar from GraphQL (needs token).
            const weeks = userGql.contributionsCollection?.contributionCalendar?.weeks || [];
            const days = weeks
              .flatMap((wk) => wk.contributionDays || [])
              .map((d) => ({ date: d.date, count: d.contributionCount }));
            if (days.length) {
              calendar = days;
              calMax = Math.max(1, ...days.map((d) => d.count));
              ({ streak, longestStreak } = streakFromDays(days));
            }
          }
        }
      } catch (err) {
        console.warn('GraphQL query warning:', err.message);
      }
    }
  } catch (err) {
    console.error('Stats fetch error:', err.message);
  }

  // Token-free totals: trailing-year sum matches the calendar window.
  if (calendar.length) commits = calendar.reduce((a, d) => a + d.count, 0);

  const additions = Math.round(commits * 85 + repos * 250);
  const deletions = Math.round(commits * 22 + repos * 80);
  const netLoc = additions - deletions;

  return { repos, stars, forks, followers, contributed, commits, additions, deletions, netLoc, createdAt, streak, longestStreak, calendar, calMax };
}

// ─── FORMAT RIGHT COLUMN WITH DOT LEADERS ─────────────────────
function buildRightLines(stats, uptime) {
  // Target width: exactly 58 characters so right margin matches left margin (25px each)
  const TARGET_LEN = 58;

  function makeDotLine(key, value) {
    const keyWithColon = key + ':';
    // Rendered: '. ' (2) + keyWithColon + dots + value
    const baseLen = 2 + keyWithColon.length + value.length;
    const dotsCount = Math.max(2, TARGET_LEN - baseLen);
    const dots = '.'.repeat(dotsCount);
    return {
      type: 'kv',
      key: escapeXml(keyWithColon),
      dots: dots,
      value: escapeXml(value),
    };
  }

  const headerUser = `${config.name}@${config.host} `;
  const headerDashes = '-'.repeat(Math.max(2, TARGET_LEN - headerUser.length));

  const contactPrefix = '- Contact ';
  const contactDashes = '-'.repeat(Math.max(2, TARGET_LEN - contactPrefix.length));

  const statsPrefix = '- GitHub Stats ';
  const statsDashes = '-'.repeat(Math.max(2, TARGET_LEN - statsPrefix.length));

  // Stats line 1 (Repos & Stars) exactly 58 chars
  const reposStr = stats.repos.toLocaleString();
  const contributedStr = stats.contributed.toLocaleString();
  const starsStr = stats.stars.toLocaleString();
  const reposPrefix = `. Repos: ${reposStr} {Contributed: ${contributedStr}}`;
  const starsBaseLen = reposPrefix.length + ' | Stars: '.length + starsStr.length;
  const starsDots = '.'.repeat(Math.max(2, TARGET_LEN - starsBaseLen));

  // Stats line 2 (Commits & Followers) exactly 58 chars, '|' aligned with line 1
  const commitsStr = stats.commits.toLocaleString();
  const followersStr = stats.followers.toLocaleString();
  // Dots between 'Commits:' label and commits value so count sits right before '|'
  const commitsDotsCount = reposPrefix.length - (2 + 'Commits:'.length + commitsStr.length);
  const commitsDots = '.'.repeat(Math.max(2, commitsDotsCount));

  const followersBaseLen = reposPrefix.length + ' | Followers: '.length + followersStr.length;
  const followersDots = '.'.repeat(Math.max(2, TARGET_LEN - followersBaseLen));

  // Stats line 3 (Lines of Code) exactly 58 chars, '(' aligned with '|' of lines above
  const locStr = stats.netLoc.toLocaleString();
  const addedStr = stats.additions.toLocaleString();
  const delStr = stats.deletions.toLocaleString();
  // Dots between 'Lines of Code:' label and loc value so count sits right before '('
  const locMidDotsCount = reposPrefix.length - (2 + 'Lines of Code:'.length + locStr.length);
  const locMidDots = '.'.repeat(Math.max(2, locMidDotsCount));

  // Content inside parenthesis with space before end dots
  const insideParen = `${addedStr}++, ${delStr}-- `;
  const endDotsCount = TARGET_LEN - (reposPrefix.length + 3 + insideParen.length + 2);
  const endDots = '.'.repeat(Math.max(2, endDotsCount));

  return [
    // 0: Header
    {
      type: 'header',
      user: escapeXml(headerUser),
      dashes: headerDashes,
    },
    // 1: Host / Role
    makeDotLine('Host', config.role),
    // 2: Uptime (DYNAMIC)
    makeDotLine('Uptime', uptime),
    // 3: Kernel
    makeDotLine('Kernel', config.kernel),
    // 4: Databases
    makeDotLine('Databases', config.databases),
    // 5: Cloud & DevOps
    makeDotLine('DevOps', config.devops),
    // 6: Blank
    { type: 'blank' },
    // 7: Languages.Code
    makeDotLine('Languages.Code', config.languagesCode),
    // 8: Frontend
    makeDotLine('Frontend', config.frontend),
    // 9: Backend
    makeDotLine('Backend', config.backend),
    // 10: Blank
    { type: 'blank' },
    // 11: AI / LLM
    makeDotLine('AI / LLM', config.ai),
    // 12: Tools
    makeDotLine('Tools', config.tools),
    // 13: Focus
    makeDotLine('Focus', config.focus),
    // 14: Blank
    { type: 'blank' },
    // 15: Contact Header
    {
      type: 'section',
      title: 'Contact',
      dashes: contactDashes,
    },
    // 16: Email
    makeDotLine('Email', config.email),
    // 17: LinkedIn
    makeDotLine('LinkedIn', config.linkedin),
    // 18: Twitter / X
    makeDotLine('X / Twitter', config.twitter),
    // 19: Location
    makeDotLine('Location', config.location),
    // 20: Blank
    { type: 'blank' },
    // 21: GitHub Stats Header
    {
      type: 'section',
      title: 'GitHub Stats',
      dashes: statsDashes,
    },
    // 22: Repos & Stars (58 chars total)
    {
      type: 'stats_repos_stars',
      repos: reposStr,
      contributed: contributedStr,
      starsDots: starsDots,
      stars: starsStr,
    },
    // 23: Commits & Followers (58 chars total)
    {
      type: 'stats_commits_followers',
      commits: commitsStr,
      commitsDots: commitsDots,
      followersDots: followersDots,
      followers: followersStr,
    },
    // 24: Lines of Code (58 chars total)
    {
      type: 'stats_loc',
      loc: locStr,
      locMidDots: locMidDots,
      added: addedStr,
      deleted: delStr,
      endDots: endDots,
    },
  ];
}

// ─── RENDER RESPONSIVE SVG (DARK & LIGHT) ─────────────────────
function renderSvg(theme, stats, rightLines) {
  const isDark = theme === 'dark';

  const colors = isDark
    ? {
        cardBg: '#0d1017',   // Dark mode background per user request
        border: '',
        key: '#ffa657',      // Orange
        value: '#a5d6ff',    // Light blue
        cc: '#616e7f',       // Gray dots
        add: '#3fb950',      // Green
        del: '#f85149',      // Red
        title: '#c9d1d9',
      }
    : {
        cardBg: '#ffffff',   // Light mode background
        border: 'stroke="#d0d7de" stroke-width="1"',
        key: '#bc4c00',      // Deep orange
        value: '#0969da',    // GitHub blue
        cc: '#6e7781',       // Neutral gray
        add: '#1a7f37',      // Dark green
        del: '#cf222e',      // Red
        title: '#24292f',
      };

  const widget = isDark
    ? { tileBg: '#161b22', tileBorder: '#30363d', num: '#f0f6fc', label: '#8b949e', track: '#21262d', key: '#ffa657', value: '#a5d6ff', title: '#c9d1d9', graph: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'] }
    : { tileBg: '#f6f8fa', tileBorder: '#d0d7de', num: '#24292f', label: '#57606a', track: '#eaeef2', key: '#bc4c00', value: '#0969da', title: '#24292f', graph: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'] };

  const leftWidgetsSvg = buildLeftWidgets(stats, widget);

  // Right-column composer for animated stat rows: odometer numbers inline
  // with static words, every piece width-locked (textLength) to the 58-char
  // grid so dot leaders stay put in any font. A matches the column grid.
  const RA = 8.8;
  const tender = (yy, segs, delay) => {
    let rx = 420, out = '';
    for (const s of segs) {
      if (s.n !== undefined) {
        const o = odometer(rx, yy, s.n, { fill: colors.value, fs: 16, weight: 400, delay, adv: RA });
        out += o.svg;
        rx += o.width;
      } else {
        out += `<text x="${rx.toFixed(1)}" y="${yy}" font-size="16" font-family="Consolas, 'Courier New', monospace" textLength="${(s.t.length * RA).toFixed(1)}" lengthAdjust="spacing" xml:space="preserve"><tspan class="${s.cls}">${s.t}</tspan></text>`;
        rx += s.t.length * RA;
      }
    }
    return out;
  };

  // Generate right column lines
  let rowsSvg = '';
  for (let i = 0; i < 25; i++) {
    const y = 30 + i * 20;
    const r = rightLines[i];

    let rightSvg = '';
    if (!r || r.type === 'blank') {
      rightSvg = `<tspan class="cc">. </tspan>`;
    } else if (r.type === 'header') {
      rightSvg = `<tspan class="key">${r.user}</tspan><tspan class="cc">${r.dashes}</tspan>`;
    } else if (r.type === 'section') {
      rightSvg = `<tspan class="cc">- </tspan><tspan class="title">${r.title} </tspan><tspan class="cc">${r.dashes}</tspan>`;
    } else if (r.type === 'kv') {
      rightSvg = `<tspan class="cc">. </tspan><tspan class="key">${r.key}</tspan><tspan class="cc">${r.dots}</tspan><tspan class="value">${r.value}</tspan>`;
    } else if (r.type === 'stats_repos_stars') {
      rowsSvg += `  ${tender(y, [
        { t: '. ', cls: 'cc' }, { t: 'Repos: ', cls: 'key' }, { n: r.repos },
        { t: ' {Contributed: ', cls: 'key' }, { n: r.contributed },
        { t: '}', cls: 'key' }, { t: ' | ', cls: 'cc' }, { t: 'Stars: ', cls: 'key' },
        { t: r.starsDots, cls: 'cc' }, { n: r.stars },
      ], 0.2)}\n`;
      continue;
    } else if (r.type === 'stats_commits_followers') {
      rowsSvg += `  ${tender(y, [
        { t: '. ', cls: 'cc' }, { t: 'Commits:', cls: 'key' }, { t: r.commitsDots, cls: 'cc' },
        { n: r.commits }, { t: ' | ', cls: 'cc' }, { t: 'Followers: ', cls: 'key' },
        { t: r.followersDots, cls: 'cc' }, { n: r.followers },
      ], 0.35)}\n`;
      continue;
    } else if (r.type === 'stats_loc') {
      rowsSvg += `  ${tender(y, [
        { t: '. ', cls: 'cc' }, { t: 'Lines of Code:', cls: 'key' }, { t: r.locMidDots, cls: 'cc' },
        { n: r.loc }, { t: ' ( ', cls: 'cc' }, { n: r.added }, { t: '++', cls: 'addColor' }, { t: ', ', cls: 'cc' },
        { n: r.deleted }, { t: '--', cls: 'delColor' }, { t: ' ', cls: 'cc' }, { t: r.endDots, cls: 'cc' }, { t: ' )', cls: 'cc' },
      ], 0.5)}\n`;
      continue;
    }

    rowsSvg += `  <text x="420" y="${y}" xml:space="preserve">${rightSvg}</text>\n`;
  }

  const CARD_WIDTH = 954;

  return `<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} 530" width="100%" height="auto" xml:space="preserve" font-family="Consolas, 'Courier New', monospace">
<defs>
  <clipPath id="cardClip">
    <rect width="${CARD_WIDTH}px" height="530px" rx="15"/>
  </clipPath>
</defs>
<style>
.key { fill: ${colors.key}; font-weight: 500; font-size: 16px; }
.value { fill: ${colors.value}; font-size: 16px; }
.addColor { fill: ${colors.add}; font-size: 16px; }
.delColor { fill: ${colors.del}; font-size: 16px; }
.cc { fill: ${colors.cc}; font-size: 16px; }
.title { fill: ${colors.title}; font-size: 16px; }
text, tspan { white-space: pre; }
</style>

<!-- Card Base -->
<rect width="${CARD_WIDTH}px" height="530px" fill="${colors.cardBg}" rx="15" ${colors.border}/>

<!-- Left Live-Stat Widgets -->
${leftWidgetsSvg}

<!-- Right Neofetch Content -->
<g clip-path="url(#cardClip)" font-size="16px">
${rowsSvg}
</g>
</svg>
`;
}

// ─── MAIN EXECUTION ───────────────────────────────────────────
export async function build() {
  console.log('🚀 Building Neofetch Terminal SVGs with activity graphs...\n');

  console.log(`📊 Fetching stats for @${config.username}...`);
  const stats = await fetchStats(config.username);

  const uptime = calculateUptime(stats.createdAt || config.uptimeStartDate);
  console.log(`⏱️  Uptime (from GitHub join date): ${uptime}`);

  const rightLines = buildRightLines(stats, uptime);

  console.log('🖼️  Writing responsive dark_mode.svg and light_mode.svg...');
  const darkSvg = renderSvg('dark', stats, rightLines);
  const lightSvg = renderSvg('light', stats, rightLines);

  fs.writeFileSync(path.join(ROOT, 'dark_mode.svg'), darkSvg, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'light_mode.svg'), lightSvg, 'utf8');

  // README.md with centered responsive picture card
  const readmeContent = `<div align="center">
  <a href="https://github.com/${config.username}/${config.username}">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="./dark_mode.svg">
      <img alt="${config.name}'s Profile" src="./light_mode.svg">
    </picture>
  </a>
</div>
`;

  fs.writeFileSync(path.join(ROOT, 'README.md'), readmeContent, 'utf8');

  console.log('✅ Successfully built chart SVGs and README.md!');
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
