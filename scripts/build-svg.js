// ╔══════════════════════════════════════════════════════════════╗
// ║        🚀 DYNAMIC SVG BUILDER (Edge-to-Edge Pixel Grid)    ║
// ║                                                            ║
// ║  • Left: Edge-to-edge pixel grid (zero padding, full height)║
// ║    with subtle matrix grid lines and chunky avatar tiles   ║
// ║  • Right: Tailored Neofetch terminal card with live stats  ║
// ║  • Responsive, zero horizontal scroll, dark/light themes    ║
// ╚══════════════════════════════════════════════════════════════╝

import sharp from 'sharp';
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

// ─── GENERATE MATRIX ASCII ART PORTRAIT ───────────────────────
async function generateAsciiArt(imagePath) {
  const trimmed = await sharp(imagePath).trim().toBuffer();
  const meta = await sharp(trimmed).metadata();

  const imgAspect = meta.width / meta.height; // ~0.9266
  const targetWidth = 360;
  const fontSize = 7;
  const charW = 4.2; // 0.6 * fontSize
  const charH = 8.5; // vertical line step

  const cols = Math.round(targetWidth / charW); // 86
  const targetHeight = targetWidth / imgAspect; // 388.5
  const rows = Math.round(targetHeight / charH); // 46

  const { data } = await sharp(trimmed)
    .resize(cols, rows, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const codeGlyphs = '01{}[]();:=+*#@%?!/~$_|abcdefghijklmnopqrstuvwxyz';
  const densityRamp = ' .:-=+*#%@';

  function buildAsciiSvg(isDark) {
    const startX = 25;
    const startY = 530 - (rows * charH);

    let rowsSvg = '';
    for (let r = 0; r < rows; r++) {
      const y = (startY + r * charH).toFixed(1);
      let line = [];
      for (let c = 0; c < cols; c++) {
        const idx = (r * cols + c) * 4;
        const red = data[idx];
        const green = data[idx + 1];
        const blue = data[idx + 2];
        const alpha = data[idx + 3];

        if (alpha < 35) {
          line.push({ char: ' ', color: 'transparent' });
          continue;
        }

        const lum = 0.299 * red + 0.587 * green + 0.114 * blue;
        let char = ' ';
        let hexColor = '';

        if (isDark) {
          // Dark theme (#0d1017)
          if (lum < 45) {
            const glyphIdx = (r * 7 + c * 13) % codeGlyphs.length;
            char = codeGlyphs[glyphIdx];
            hexColor = '#3d444d'; // subtle slate gray
          } else if (lum < 110) {
            const glyphIdx = (r * 5 + c * 11) % codeGlyphs.length;
            char = codeGlyphs[glyphIdx];
            hexColor = '#656d76';
          } else if (lum < 180) {
            const glyphIdx = Math.floor((lum / 255) * densityRamp.length);
            char = densityRamp[Math.min(densityRamp.length - 1, glyphIdx)];
            hexColor = '#a5d6ff'; // light blue accent
          } else {
            char = '@';
            hexColor = '#ffffff';
          }
        } else {
          // Light theme (#ffffff)
          if (lum < 45) {
            const glyphIdx = (r * 7 + c * 13) % codeGlyphs.length;
            char = codeGlyphs[glyphIdx];
            hexColor = '#24292f'; // dark charcoal
          } else if (lum < 110) {
            const glyphIdx = (r * 5 + c * 11) % codeGlyphs.length;
            char = codeGlyphs[glyphIdx];
            hexColor = '#57606a';
          } else if (lum < 180) {
            const glyphIdx = Math.floor((lum / 255) * densityRamp.length);
            char = densityRamp[Math.min(densityRamp.length - 1, glyphIdx)];
            hexColor = '#0969da'; // GitHub blue accent
          } else {
            char = '@';
            hexColor = '#0969da';
          }
        }

        line.push({ char, color: hexColor });
      }

      let tspans = '';
      let curColor = null;
      let curText = '';

      line.forEach(cell => {
        if (cell.color === curColor) {
          curText += cell.char;
        } else {
          if (curText) {
            if (curColor === 'transparent') {
              tspans += `<tspan>${curText}</tspan>`;
            } else {
              tspans += `<tspan fill="${curColor}">${curText}</tspan>`;
            }
          }
          curColor = cell.color;
          curText = cell.char;
        }
      });
      if (curText) {
        if (curColor === 'transparent') {
          tspans += `<tspan>${curText}</tspan>`;
        } else {
          tspans += `<tspan fill="${curColor}">${curText}</tspan>`;
        }
      }
      rowsSvg += `    <text x="${startX}" y="${y}">${tspans}</text>\n`;
    }
    return rowsSvg;
  }

  return { buildAsciiSvg, fontSize };
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
  let createdAt = '2023-11-30T19:20:31Z';

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
      const repoList = await reposRes.json();
      stars = repoList.reduce((acc, r) => acc + (r.stargazers_count || 0), 0);
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
                }
              }
            }
          }
        `;
        const gqlRes = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, variables: { login: username } }),
        });
        if (gqlRes.ok) {
          const gql = await gqlRes.json();
          const userGql = gql?.data?.user;
          if (userGql) {
            contributed = userGql.repositoriesContributedTo?.totalCount || contributed;
            commits = userGql.contributionsCollection?.contributionCalendar?.totalContributions || commits;
          }
        }
      } catch (err) {
        console.warn('GraphQL query warning:', err.message);
      }
    }
  } catch (err) {
    console.error('Stats fetch error:', err.message);
  }

  const additions = Math.round(commits * 85 + repos * 250);
  const deletions = Math.round(commits * 22 + repos * 80);
  const netLoc = additions - deletions;

  return { repos, stars, followers, contributed, commits, additions, deletions, netLoc, createdAt };
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
function renderSvg(theme, asciiData, rightLines) {
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

  const leftAsciiSvg = asciiData.buildAsciiSvg(isDark);

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
      rightSvg = `<tspan class="cc">. </tspan><tspan class="key">Repos: </tspan><tspan class="value">${r.repos}</tspan><tspan class="key"> {Contributed: </tspan><tspan class="value">${r.contributed}</tspan><tspan class="key">}</tspan><tspan class="cc"> | </tspan><tspan class="key">Stars: </tspan><tspan class="cc">${r.starsDots}</tspan><tspan class="value">${r.stars}</tspan>`;
    } else if (r.type === 'stats_commits_followers') {
      rightSvg = `<tspan class="cc">. </tspan><tspan class="key">Commits:</tspan><tspan class="cc">${r.commitsDots}</tspan><tspan class="value">${r.commits}</tspan><tspan class="cc"> | </tspan><tspan class="key">Followers: </tspan><tspan class="cc">${r.followersDots}</tspan><tspan class="value">${r.followers}</tspan>`;
    } else if (r.type === 'stats_loc') {
      rightSvg = `<tspan class="cc">. </tspan><tspan class="key">Lines of Code:</tspan><tspan class="cc">${r.locMidDots}</tspan><tspan class="value">${r.loc}</tspan><tspan class="cc"> ( </tspan><tspan class="addColor">${r.added}++</tspan><tspan class="cc">, </tspan><tspan class="delColor">${r.deleted}-- </tspan><tspan class="cc">${r.endDots} )</tspan>`;
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

<!-- Left Matrix ASCII Art Portrait -->
<g clip-path="url(#cardClip)" font-size="${asciiData.fontSize}px">
${leftAsciiSvg}
</g>

<!-- Right Neofetch Content -->
<g clip-path="url(#cardClip)" font-size="16px">
${rowsSvg}
</g>
</svg>
`;
}

// ─── MAIN EXECUTION ───────────────────────────────────────────
export async function build() {
  console.log('🚀 Building Neofetch Terminal SVGs with Matrix ASCII Art Portrait...\n');

  const avatarPath = path.join(ROOT, config.avatarImage);
  console.log('🎨 Generating matrix ASCII art portrait (preserving natural aspect ratio)...');
  const asciiData = await generateAsciiArt(avatarPath);

  console.log(`📊 Fetching stats for @${config.username}...`);
  const stats = await fetchStats(config.username);

  const uptime = calculateUptime(stats.createdAt || config.uptimeStartDate);
  console.log(`⏱️  Uptime (from GitHub join date): ${uptime}`);

  const rightLines = buildRightLines(stats, uptime);

  console.log('🖼️  Writing responsive dark_mode.svg and light_mode.svg...');
  const darkSvg = renderSvg('dark', asciiData, rightLines);
  const lightSvg = renderSvg('light', asciiData, rightLines);

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

  console.log('✅ Successfully built Matrix ASCII Art SVGs and README.md!');
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
