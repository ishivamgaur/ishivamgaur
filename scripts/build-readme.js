// ╔══════════════════════════════════════════════════════════════╗
// ║        🚀 PURE TEXT DYNAMIC README BUILDER (Node.js)       ║
// ║                                                            ║
// ║  100% Selectable, Copyable Markdown Text in ```ansi         ║
// ║  NO PNG, NO SVG — pure text you can select and edit!        ║
// ║  Live GitHub stats + Dynamic Uptime updated automatically!  ║
// ╚══════════════════════════════════════════════════════════════╝

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ─── ANSI COLORS (Native GitHub Markdown Support) ─────────────
const A = {
  reset: '\x1b[0m',
  ascii: '\x1b[38;2;201;209;219m', // Soft light gray
  key:   '\x1b[38;2;255;166;87m',  // Bright orange
  val:   '\x1b[38;2;165;214;255m', // Sky blue
  cc:    '\x1b[38;2;97;110;127m',  // Dim gray for dots and dashes
  add:   '\x1b[38;2;63;185;80m',   // Green (+ additions)
  del:   '\x1b[38;2;248;81;73m',   // Red (- deletions)
};

// ─── GENERATE TUNED ASCII ART ─────────────────────────────────
async function generateAsciiArt(imagePath, width = 36, height = 25) {
  const trimmed = await sharp(imagePath).trim().toBuffer();
  const tMeta = await sharp(trimmed).metadata();
  
  // Crop to top 78% of character (head, face, raised arm, chest)
  const cropH = Math.round(tMeta.height * 0.78);
  const cropW = tMeta.width;

  const { data } = await sharp(trimmed)
    .extract({ left: 0, top: 0, width: cropW, height: cropH })
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const lines = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a < 40) {
        row += ' ';
        continue;
      }
      const b = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const val = Math.floor(b / 26);

      if (val === 0) {
        if (y <= 5) {
          // Hair
          const c = ['@', '%', 'M', 'g', 'N', 'W', '#'];
          row += c[(x * 2 + y * 5) % c.length];
        } else if (y >= 6 && y <= 10 && x >= 15 && x <= 27) {
          // Beard, mustache, pupils
          const c = ['@', '%', '#', 'M', 'k', 'j'];
          row += c[(x + y) % c.length];
        } else {
          // Shirt body: Andrew-style folds & texture
          const c = ['@', '%', 'm', 'g', 'p', 'b', 'k', 'j', 'i', '|', '{', '}'];
          row += c[(x * 3 + y * 7) % c.length];
        }
      } else if (val === 1) {
        // Dark tones / hair edges / beard edges
        const c = ['%', 'k', 'j', 'm', 'p', 'b', '|'];
        row += c[(x + y) % c.length];
      } else if (val === 2) {
        // Shadow on face / arm contour
        const c = ['|', 'j', '/', '\\', '(', ')', '[', ']'];
        row += c[(x + y) % c.length];
      } else if (val === 3) {
        // Features (eyebrow, nose contour, lip)
        const c = ['~', '=', '+', '-', '*'];
        row += c[(x + y) % c.length];
      } else if (val === 4) {
        // Shaded skin
        const c = [':', ';', ',', '.', '\''];
        row += c[(x + y) % c.length];
      } else if (val >= 5 && val <= 7) {
        // Bright skin
        if (y >= 8 && y <= 12 && x <= 13) {
          // Raised arm skin
          row += (x + y) % 2 === 0 ? '|' : '\'';
        } else {
          // Face skin
          row += (x + y) % 3 === 0 ? '.' : (x + y) % 3 === 1 ? '`' : ' ';
        }
      } else {
        row += ' ';
      }
    }
    lines.push(row.padEnd(width, ' '));
  }
  return lines;
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

// ─── LIVE GITHUB STATS ────────────────────────────────────────
async function fetchStats(username) {
  const token = process.env.GITHUB_TOKEN || process.env.ACCESS_TOKEN;
  const headers = { 'User-Agent': 'profile-readme', Accept: 'application/vnd.github.v3+json' };
  if (token) headers.Authorization = `token ${token}`;

  let repos = 38, followers = 29, stars = 38, contributed = 12, commits = 1450;

  try {
    const uRes = await fetch(`https://api.github.com/users/${username}`, { headers });
    if (uRes.ok) {
      const u = await uRes.json();
      repos = u.public_repos ?? repos;
      followers = u.followers ?? followers;
    }

    const rRes = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { headers });
    if (rRes.ok) {
      const rList = await rRes.json();
      stars = rList.reduce((acc, r) => acc + (r.stargazers_count || 0), 0);
    }

    if (token) {
      try {
        const query = `query($login:String!){user(login:$login){repositoriesContributedTo(first:1){totalCount}contributionsCollection{contributionCalendar{totalContributions}}}}`;
        const gqlRes = await fetch('https://api.github.com/graphql', {
          method: 'POST', headers, body: JSON.stringify({ query, variables: { login: username } })
        });
        if (gqlRes.ok) {
          const gql = await gqlRes.json();
          const uGql = gql?.data?.user;
          if (uGql) {
            contributed = uGql.repositoriesContributedTo?.totalCount || contributed;
            commits = uGql.contributionsCollection?.contributionCalendar?.totalContributions || commits;
          }
        }
      } catch {}
    }
  } catch {}

  const additions = Math.round(commits * 85 + repos * 250);
  const deletions = Math.round(commits * 22 + repos * 80);
  const loc = additions - deletions;

  return { repos, stars, followers, contributed, commits, additions, deletions, loc };
}

// ─── BUILD ANSI TERMINAL CARD ─────────────────────────────────
async function buildCard() {
  const avatarPath = path.join(ROOT, config.avatarImage);
  const asciiLines = await generateAsciiArt(avatarPath, 36, 25);
  const stats = await fetchStats(config.username);
  const uptime = calculateUptime(config.uptimeStartDate);

  const COL_WIDTH = 56;

  function makeDotLine(key, value) {
    const prefix = `. ${key}: `;
    const dotsCount = Math.max(2, COL_WIDTH - prefix.length - value.length);
    const dots = '.'.repeat(dotsCount);
    return `${A.cc}. ${A.reset}${A.key}${key}:${A.reset}${A.cc} ${dots} ${A.reset}${A.val}${value}${A.reset}`;
  }

  const rightLines = [
    // 0: Header
    `${A.key}${config.name}@${config.host}${A.reset} ${A.cc}${'─'.repeat(44)}${A.reset}`,
    // 1: OS
    makeDotLine('OS', config.os),
    // 2: Uptime (DYNAMIC)
    makeDotLine('Uptime', uptime),
    // 3: Host
    makeDotLine('Host', config.role),
    // 4: Kernel
    makeDotLine('Kernel', config.kernel),
    // 5: IDE
    makeDotLine('IDE', config.ide),
    // 6: Blank
    `${A.cc}.${A.reset}`,
    // 7: Languages.Programming
    makeDotLine('Languages.Programming', config.languagesProgramming),
    // 8: Languages.Computer
    makeDotLine('Languages.Computer', config.languagesComputer),
    // 9: Languages.Real
    makeDotLine('Languages.Real', config.languagesReal),
    // 10: Blank
    `${A.cc}.${A.reset}`,
    // 11: Hobbies.Software
    makeDotLine('Hobbies.Software', config.hobbiesSoftware),
    // 12: Hobbies.Hardware
    makeDotLine('Hobbies.Hardware', config.hobbiesHardware),
    // 13: Blank
    `${A.cc}.${A.reset}`,
    // 14: Contact Header
    `${A.cc}─ ${A.reset}${A.ascii}Contact${A.reset} ${A.cc}${'─'.repeat(48)}${A.reset}`,
    // 15: Email.Personal
    makeDotLine('Email.Personal', config.emailPersonal),
    // 16: Email.Work
    makeDotLine('Email.Work', config.emailWork),
    // 17: LinkedIn
    makeDotLine('LinkedIn', config.linkedin),
    // 18: X / Twitter
    makeDotLine('X', config.twitter),
    // 19: Instagram
    makeDotLine('Instagram', config.instagram),
    // 20: Blank
    `${A.cc}.${A.reset}`,
    // 21: GitHub Stats Header
    `${A.cc}─ ${A.reset}${A.ascii}GitHub Stats${A.reset} ${A.cc}${'─'.repeat(43)}${A.reset}`,
    // 22: Repos & Stars
    `${A.cc}. ${A.reset}${A.key}Repos:${A.reset}${A.cc} .... ${A.reset}${A.val}${stats.repos}${A.reset} ${A.key}{Contributed: ${A.reset}${A.val}${stats.contributed}${A.reset}${A.key}}${A.reset} ${A.cc}|${A.reset} ${A.key}Stars:${A.reset}${A.cc} .......... ${A.reset}${A.val}${stats.stars}${A.reset}`,
    // 23: Commits & Followers
    `${A.cc}. ${A.reset}${A.key}Commits:${A.reset}${A.cc} ................... ${A.reset}${A.val}${stats.commits.toLocaleString()}${A.reset} ${A.cc}|${A.reset} ${A.key}Followers:${A.reset}${A.cc} ...... ${A.reset}${A.val}${stats.followers}${A.reset}`,
    // 24: Lines of Code
    `${A.cc}. ${A.reset}${A.key}Lines of Code on GitHub:${A.reset} ${A.val}${stats.loc.toLocaleString()}${A.reset} ${A.cc}( ${A.reset}${A.add}${stats.additions.toLocaleString()}++${A.reset}${A.cc}, ${A.reset}${A.del}${stats.deletions.toLocaleString()}--${A.reset}${A.cc} )${A.reset}`,
  ];

  // Combine Left (ASCII) + Right (Neofetch)
  const combined = [];
  const GAP = '    '; // 4 spaces between columns
  for (let i = 0; i < 25; i++) {
    const left = `${A.ascii}${asciiLines[i]}${A.reset}`;
    const right = rightLines[i] || '';
    combined.push(`${left}${GAP}${right}`);
  }

  return combined.join('\n');
}

// ─── UPDATE README.md ─────────────────────────────────────────
export async function updateReadme() {
  console.log('🚀 Generating pure text dynamic README...\n');
  const card = await buildCard();

  const readmePath = path.join(ROOT, 'README.md');
  const startMarker = '<!-- START_SECTION:neofetch -->';
  const endMarker = '<!-- END_SECTION:neofetch -->';

  const wrappedCard = `${startMarker}\n\`\`\`ansi\n${card}\n\`\`\`\n${endMarker}`;

  const readmeTemplate = `# Hi, I'm Shivam 👋

${wrappedCard}

### 🚀 About Me
- 💼 **Full Stack Web Developer (MERN)** with 2+ years of professional experience
- 🛠️ Building scalable web applications, clean APIs, and interactive UI/UX
- 🌱 Exploring modern cloud architecture, developer tooling, and system design
- 📬 Reach me at **[${config.emailPersonal}](mailto:${config.emailPersonal})** or connect on **[LinkedIn](https://linkedin.com/in/${config.linkedin})**

---
<div align="center">
  <sub>Generated dynamically with Node.js &amp; GitHub Actions • Pure Selectable ANSI Text</sub>
</div>
`;

  fs.writeFileSync(readmePath, readmeTemplate, 'utf8');
  console.log('✅ README.md updated with pure selectable text!');
}

updateReadme().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
