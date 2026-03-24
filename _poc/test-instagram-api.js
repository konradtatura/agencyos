import 'dotenv/config';
import fetch from 'node-fetch';
import chalk from 'chalk';

const TOKEN = process.env.META_LONG_LIVED_TOKEN;
const ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
const BASE = 'https://graph.facebook.com/v19.0';

const results = [];

function log(msg) {
  console.log(msg);
}

function header(title) {
  log('');
  log(chalk.bold.cyan(`━━━ ${title} ━━━`));
}

function record(name, status, note = '') {
  results.push({ name, status, note });
}

async function apiFetch(url) {
  const res = await fetch(url);
  const json = await res.json();
  return { ok: res.ok, status: res.status, data: json };
}

// ─── TEST 1: Account Connection ───────────────────────────────────────────────
async function test1() {
  header('TEST 1 — Account Connection');
  const url = `${BASE}/${ACCOUNT_ID}?fields=id,username,name,followers_count,follows_count,media_count,profile_picture_url,website&access_token=${TOKEN}`;
  const { ok, data } = await apiFetch(url);

  if (ok && data.username) {
    log(chalk.green(`  Username:   @${data.username}`));
    log(chalk.green(`  Followers:  ${data.followers_count?.toLocaleString() ?? 'N/A'}`));
    log(chalk.green(`  Posts:      ${data.media_count ?? 'N/A'}`));
    log(chalk.green(`  Following:  ${data.follows_count ?? 'N/A'}`));
    record('Account Connection', 'pass');
    return true;
  } else {
    log(chalk.red(`  Error: ${data.error?.message ?? 'Unknown error'}`));
    record('Account Connection', 'fail', data.error?.message);
    return false;
  }
}

// ─── TEST 2: Account Insights ─────────────────────────────────────────────────
async function test2() {
  header('TEST 2 — Account Insights (Last 7 Days)');
  const now = Math.floor(Date.now() / 1000);
  const week = now - 7 * 24 * 60 * 60;
  const url = `${BASE}/${ACCOUNT_ID}/insights?metric=impressions,reach,profile_views,website_clicks&period=day&since=${week}&until=${now}&access_token=${TOKEN}`;
  const { ok, data } = await apiFetch(url);

  if (ok && data.data?.length > 0) {
    for (const metric of data.data) {
      log(chalk.blue(`  ${metric.name}:`));
      const values = metric.values ?? [];
      for (const v of values.slice(0, 7)) {
        const date = new Date(v.end_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        log(`    ${date}: ${chalk.white(v.value)}`);
      }
    }
    record('Account Insights', 'pass');
  } else {
    log(chalk.red(`  Error: ${data.error?.message ?? 'No data returned'}`));
    record('Account Insights', 'fail', data.error?.message);
  }
}

// ─── TEST 3: Fetch Posts ──────────────────────────────────────────────────────
async function test3() {
  header('TEST 3 — Recent Posts');
  const url = `${BASE}/${ACCOUNT_ID}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=5&access_token=${TOKEN}`;
  const { ok, data } = await apiFetch(url);

  let firstReelId = null;
  let firstImageId = null;

  if (ok && data.data?.length > 0) {
    for (const post of data.data) {
      const date = new Date(post.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const caption = (post.caption ?? '(no caption)').slice(0, 60).replace(/\n/g, ' ');
      log(`  ${chalk.yellow(post.media_type.padEnd(12))} ${chalk.gray(date)}  ❤️  ${post.like_count ?? 0}  💬 ${post.comments_count ?? 0}`);
      log(`    ${chalk.gray(caption)}`);

      if (!firstReelId && post.media_type === 'VIDEO') firstReelId = post.id;
      if (!firstImageId && post.media_type === 'IMAGE') firstImageId = post.id;
    }
    record('Fetch Posts', 'pass');
  } else {
    log(chalk.red(`  Error: ${data.error?.message ?? 'No posts returned'}`));
    record('Fetch Posts', 'fail', data.error?.message);
  }

  return { firstReelId, firstImageId };
}

// ─── TEST 4: Image Post Insights ──────────────────────────────────────────────
async function test4(imageId) {
  header('TEST 4 — Image Post Insights');
  if (!imageId) {
    log(chalk.yellow('  No image post found in Test 3 — skipping'));
    record('Image Post Insights', 'skip', 'No image post available');
    return;
  }

  const url = `${BASE}/${imageId}/insights?metric=impressions,reach,saved,shares,total_interactions&access_token=${TOKEN}`;
  const { ok, data } = await apiFetch(url);

  if (ok && data.data?.length > 0) {
    let hasReach = false, hasImpressions = false;
    for (const m of data.data) {
      log(`  ${chalk.blue(m.name.padEnd(20))} ${chalk.white(m.values?.[0]?.value ?? m.value ?? 0)}`);
      if (m.name === 'reach') hasReach = true;
      if (m.name === 'impressions') hasImpressions = true;
    }
    if (hasReach && hasImpressions) {
      record('Image Post Insights', 'pass');
    } else {
      record('Image Post Insights', 'fail', 'Missing reach or impressions');
    }
  } else {
    log(chalk.red(`  Error: ${data.error?.message ?? 'No data'}`));
    record('Image Post Insights', 'fail', data.error?.message);
  }
}

// ─── TEST 5: Reel Insights ─────────────────────────────────────────────────────
async function test5(reelId) {
  header('TEST 5 — Reel Insights');
  if (!reelId) {
    log(chalk.yellow('  No reels found — skipping'));
    record('Reel Insights', 'skip', 'No reels found in Test 3');
    return;
  }

  const url = `${BASE}/${reelId}/insights?metric=impressions,reach,saved,shares,plays,video_views,total_interactions&access_token=${TOKEN}`;
  const { ok, data } = await apiFetch(url);

  if (ok && data.data?.length > 0) {
    let hasPlays = false, hasVideoViews = false;
    for (const m of data.data) {
      log(`  ${chalk.blue(m.name.padEnd(20))} ${chalk.white(m.values?.[0]?.value ?? m.value ?? 0)}`);
      if (m.name === 'plays') hasPlays = true;
      if (m.name === 'video_views') hasVideoViews = true;
    }
    if (hasPlays) {
      log(chalk.green('  ✓ plays metric returned'));
    } else if (hasVideoViews) {
      log(chalk.green('  ✓ video_views returned (plays not available for this reel)'));
    }
    if (hasPlays || hasVideoViews) {
      record('Reel Insights', 'pass');
    } else {
      record('Reel Insights', 'fail', 'Neither plays nor video_views returned');
    }
  } else {
    log(chalk.red(`  Error: ${data.error?.message ?? 'No data'}`));
    record('Reel Insights', 'fail', data.error?.message);
  }
}

// ─── TEST 6: Story Insights ────────────────────────────────────────────────────
async function test6() {
  header('TEST 6 — Story Insights');
  const url = `${BASE}/${ACCOUNT_ID}/stories?fields=id,media_type,timestamp,impressions,reach,taps_forward,taps_back,exits,replies&access_token=${TOKEN}`;
  const { ok, data } = await apiFetch(url);

  if (ok) {
    const stories = data.data ?? [];
    if (stories.length === 0) {
      log(chalk.yellow('  No active stories right now — inconclusive, not a failure'));
      record('Story Insights', 'warn', 'No active stories');
    } else {
      log(`  ${chalk.green(`${stories.length} active story/stories found`)}`);
      const s = stories[0];
      const date = new Date(s.timestamp).toLocaleString();
      log(`  First story: ${chalk.gray(date)}`);
      const fields = ['impressions', 'reach', 'taps_forward', 'taps_back', 'exits', 'replies'];
      for (const f of fields) {
        if (s[f] !== undefined) log(`    ${chalk.blue(f.padEnd(16))} ${chalk.white(s[f])}`);
      }
      record('Story Insights', 'pass');
    }
  } else {
    log(chalk.red(`  Error: ${data.error?.message ?? 'Unknown error'}`));
    record('Story Insights', 'fail', data.error?.message);
  }
}

// ─── TEST 7: Follower Demographics ────────────────────────────────────────────
async function test7() {
  header('TEST 7 — Follower Demographics (Optional)');
  const url = `${BASE}/${ACCOUNT_ID}/insights?metric=follower_demographics&period=lifetime&breakdown=age,gender&access_token=${TOKEN}`;
  const { ok, data } = await apiFetch(url);

  if (ok && data.data?.length > 0) {
    log(chalk.green('  Demographics data available'));
    const demo = data.data[0];
    const entries = Object.entries(demo.values?.[0]?.value ?? {}).slice(0, 5);
    for (const [key, val] of entries) {
      log(`  ${chalk.blue(key.padEnd(16))} ${chalk.white(val)}`);
    }
    record('Follower Demographics', 'pass');
  } else {
    log(chalk.yellow(`  Optional metric not available — this is fine`));
    if (data.error) log(chalk.gray(`  (${data.error.message})`));
    record('Follower Demographics', 'warn', 'Optional — not available');
  }
}

// ─── TEST 8: DM Permissions ────────────────────────────────────────────────────
async function test8() {
  header('TEST 8 — DM Permissions');
  const url = `${BASE}/${ACCOUNT_ID}/conversations?platform=instagram&access_token=${TOKEN}`;
  const { ok, data } = await apiFetch(url);

  if (ok) {
    const count = data.data?.length ?? 0;
    log(chalk.green(`  DM inbox accessible — ${count} conversation(s) found`));
    record('DM Permissions', 'pass');
  } else {
    const msg = data.error?.message ?? 'Unknown error';
    const isPermission = msg.toLowerCase().includes('permission') || data.error?.code === 10 || data.error?.code === 200;
    if (isPermission) {
      log(chalk.yellow('  DM inbox requires Meta Business Verification — expected at this stage'));
    } else {
      log(chalk.yellow(`  Not accessible: ${msg}`));
    }
    log(chalk.gray('  (This is optional — not counted as a failure)'));
    record('DM Permissions', 'warn', msg);
  }
}

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
function printSummary() {
  log('');
  log(chalk.bold.white('AGENCYOS — INSTAGRAM API POC RESULTS'));
  log(chalk.white('====================================='));

  let passes = 0, fails = 0;

  for (const r of results) {
    if (r.status === 'pass') {
      log(`  ${chalk.green('✅ PASS')}  ${r.name}`);
      passes++;
    } else if (r.status === 'fail') {
      log(`  ${chalk.red('❌ FAIL')}  ${r.name}${r.note ? chalk.gray(` — ${r.note}`) : ''}`);
      fails++;
    } else if (r.status === 'warn') {
      log(`  ${chalk.yellow('⚠️  INFO')}  ${r.name}${r.note ? chalk.gray(` — ${r.note}`) : ''}`);
    } else if (r.status === 'skip') {
      log(`  ${chalk.yellow('⚠️  SKIP')}  ${r.name}${r.note ? chalk.gray(` — ${r.note}`) : ''}`);
    }
  }

  log('');
  log(chalk.bold(`  Tests passed: ${chalk.green(passes)}  |  Tests failed: ${chalk.red(fails)}`));
  log('');

  if (fails === 0) {
    log(chalk.bold.green('  VERDICT: ✅ Ready to build'));
  } else {
    log(chalk.bold.red(`  VERDICT: ❌ Has blockers (${fails} test${fails > 1 ? 's' : ''} failed)`));
  }
  log('');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  log('');
  log(chalk.bold.white('  AGENCYOS — Instagram Graph API POC'));
  log(chalk.gray('  Testing API connectivity and permissions...\n'));

  if (!TOKEN || !ACCOUNT_ID) {
    log(chalk.red('  Missing credentials in .env'));
    log(chalk.yellow('  Fill in META_LONG_LIVED_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID'));
    log('');
    log(chalk.cyan('  Fill in your credentials in .env then run: node test-instagram-api.js'));
    process.exit(1);
  }

  await test1();
  await test2();
  const { firstReelId, firstImageId } = await test3();
  await test4(firstImageId);
  await test5(firstReelId);
  await test6();
  await test7();
  await test8();

  printSummary();
  log(chalk.gray('  Fill in your credentials in .env then run: node test-instagram-api.js'));
  log('');
}

main().catch((err) => {
  log(chalk.red(`\n  Fatal error: ${err.message}`));
  process.exit(1);
});
