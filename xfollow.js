// xfollow.js - Follow @moonpay dari multi-akun
// Baca akun dari x.txt (auth_token\nct0 per blok, dipisah baris kosong)

import fs from "fs";
import readline from "readline";

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const TARGET_USERNAME = "moonpay";
const DELAY_MIN_MS    = 15000;
const DELAY_MAX_MS    = 35000;
const ACCOUNTS_FILE   = "x.txt";

// ─────────────────────────────────────────────────────────────
// PARSE x.txt
// ─────────────────────────────────────────────────────────────
function loadAccounts() {
  const raw    = fs.readFileSync(ACCOUNTS_FILE, "utf-8").trim();
  const blocks = raw.split(/\n\s*\n/);
  return blocks.map((block, i) => {
    const [auth_token, ct0] = block.trim().split("\n").map((l) => l.trim().replace(/\r/g, ""));
    if (!auth_token || !ct0) throw new Error(`x.txt blok ${i + 1} format salah`);
    return { label: `akun${i + 1}`, auth_token, ct0 };
  });
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

function makeHeaders(ct0, auth_token, formEncoded = false) {
  return {
    authorization      : "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
    "x-csrf-token"     : ct0,
    cookie             : `ct0=${ct0}; auth_token=${auth_token}`,
    "content-type"     : formEncoded ? "application/x-www-form-urlencoded" : "application/json",
    "x-twitter-active-user"    : "yes",
    "x-twitter-auth-type"      : "OAuth2Session",
    "x-twitter-client-language": "en",
    origin             : "https://twitter.com",
    referer            : "https://twitter.com/",
    "user-agent"       : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
  };
}

async function xfetch(url, options = {}) {
  const res  = await fetch(url, options);
  const text = await res.text();
  if (!text?.trim()) throw Object.assign(new Error(`HTTP ${res.status} - empty response`), { data: null });
  let json;
  try { json = JSON.parse(text); }
  catch { throw Object.assign(new Error(`HTTP ${res.status} - non-JSON: ${text.slice(0, 200)}`), { data: text }); }
  if (!res.ok) throw Object.assign(new Error("HTTP " + res.status), { data: json });
  return json;
}

// ─────────────────────────────────────────────────────────────
// GET USER ID (GraphQL)
// ─────────────────────────────────────────────────────────────
async function getUserId(username, ct0, auth_token) {
  const vars = encodeURIComponent(JSON.stringify({
    screen_name: username,
    withSafetyModeUserFields: true,
  }));
  const features = encodeURIComponent(JSON.stringify({
    hidden_profile_subscriptions_enabled                              : true,
    rweb_tipjar_consumption_enabled                                   : true,
    responsive_web_graphql_exclude_directive_enabled                  : true,
    verified_phone_label_enabled                                      : false,
    subscriptions_verification_info_is_identity_verified_enabled      : true,
    subscriptions_verification_info_verified_since_enabled            : true,
    highlights_tweets_tab_ui_enabled                                  : true,
    responsive_web_twitter_article_notes_tab_enabled                  : false,
    creator_subscriptions_tweet_preview_api_enabled                   : true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled : false,
    responsive_web_graphql_timeline_navigation_enabled                : true,
  }));
  const url  = `https://twitter.com/i/api/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName?variables=${vars}&features=${features}`;
  const data = await xfetch(url, { headers: makeHeaders(ct0, auth_token) });
  return data.data.user.result.rest_id;
}

// ─────────────────────────────────────────────────────────────
// FOLLOW
// ─────────────────────────────────────────────────────────────
async function followUser(userId, ct0, auth_token) {
  return xfetch("https://twitter.com/i/api/1.1/friendships/create.json", {
    method : "POST",
    headers: makeHeaders(ct0, auth_token, true),
    body   : new URLSearchParams({ user_id: userId, skip_status: true }),
  });
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  const allAccounts = loadAccounts();
  console.log(`\nLoaded ${allAccounts.length} akun dari ${ACCOUNTS_FILE}\n`);

  console.log(`Pilih mode:`);
  console.log(`  1. 1 akun`);
  console.log(`  2. Range (dari akun X sampai selesai)`);

  const mode = await prompt(`\nPilihan [1/2]: `);
  let accounts;

  if (mode === "1") {
    const list = allAccounts.map((a, i) => `  ${i + 1}. ${a.label}`).join("\n");
    console.log(`\n${list}`);
    const pick = await prompt(`Pilih akun [1-${allAccounts.length}]: `);
    const idx  = parseInt(pick, 10);
    if (isNaN(idx) || idx < 1 || idx > allAccounts.length) { console.error(`Tidak valid.`); process.exit(1); }
    accounts = [allAccounts[idx - 1]];
    console.log(`\n▶ ${allAccounts[idx - 1].label}\n`);

  } else if (mode === "2") {
    const from = await prompt(`Mulai dari akun ke- [1-${allAccounts.length}]: `);
    const idx  = parseInt(from, 10);
    if (isNaN(idx) || idx < 1 || idx > allAccounts.length) { console.error(`Tidak valid.`); process.exit(1); }
    accounts = allAccounts.slice(idx - 1);
    console.log(`\n▶ akun${idx} → akun${allAccounts.length}\n`);

  } else {
    console.error(`Pilihan tidak valid.`); process.exit(1);
  }

  // Resolve target ID sekali aja pakai akun pertama
  console.log(`Resolving @${TARGET_USERNAME}...`);
  let targetId;
  try {
    targetId = await getUserId(TARGET_USERNAME, accounts[0].ct0, accounts[0].auth_token);
    console.log(`@${TARGET_USERNAME} → ID: ${targetId}\n`);
  } catch (err) {
    console.error(`Gagal resolve @${TARGET_USERNAME}:`, err.data || err.message);
    process.exit(1);
  }

  for (const account of accounts) {
    const { label, ct0, auth_token } = account;
    console.log(`[${label}] Follow @${TARGET_USERNAME}...`);

    try {
      await followUser(targetId, ct0, auth_token);
      console.log(`[${label}] ✓ Followed @${TARGET_USERNAME}`);
    } catch (err) {
      const code = err.data?.errors?.[0]?.code;
      if (code === 160) {
        console.log(`[${label}] ⊘ Already following @${TARGET_USERNAME}`);
      } else if (code === 326) {
        console.error(`[${label}] ✗ Akun kena challenge/lock!`);
      } else {
        console.error(`[${label}] ✗ Error:`, err.data || err.message);
      }
    }

    if (account !== accounts.at(-1)) {
      const delay = Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1)) + DELAY_MIN_MS;
      console.log(`  ⏱  next in ${(delay / 1000).toFixed(1)}s\n`);
      await sleep(delay);
    }
  }

  console.log("\n✅ Selesai.");
}

main().catch(console.error);
