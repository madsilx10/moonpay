// xfollow.js - Follow followers of a target X account
// Baca akun dari x.txt (auth_token\nct0 per blok, dipisah baris kosong)
// Usage:
//   node xfollow.js      → semua akun
//   node xfollow.js 2    → akun ke-2 aja

import fs from "fs";
import readline from "readline";

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const TARGET_USERNAME = "moonpay";
const FOLLOW_LIMIT    = 100;
const DELAY_MIN_MS    = 15000;
const DELAY_MAX_MS    = 35000;
const ACCOUNTS_FILE   = "x.txt";
const PROGRESS_FILE   = "follow_progress.json";

// ─────────────────────────────────────────────────────────────
// PARSE x.txt
// ─────────────────────────────────────────────────────────────
function loadAccounts() {
  const raw = fs.readFileSync(ACCOUNTS_FILE, "utf-8").trim();
  const blocks = raw.split(/\n\s*\n/);
  return blocks.map((block, i) => {
    const [auth_token, ct0] = block.trim().split("\n").map((l) => l.trim());
    if (!auth_token || !ct0) throw new Error(`x.txt blok ${i + 1} format salah`);
    return { label: `akun${i + 1}`, auth_token, ct0 };
  });
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE))
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
  return {};
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

function makeHeaders(ct0, auth_token, formEncoded = false) {
  return {
    authorization:
      "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
    "x-csrf-token"              : ct0,
    cookie                      : `ct0=${ct0}; auth_token=${auth_token}`,
    "content-type"              : formEncoded ? "application/x-www-form-urlencoded" : "application/json",
    "x-twitter-active-user"    : "yes",
    "x-twitter-auth-type"      : "OAuth2Session",
    "x-twitter-client-language": "en",
    "user-agent"                : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
  };
}

async function xfetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();

  if (!text || !text.trim()) {
    throw Object.assign(new Error(`HTTP ${res.status} - empty response`), { data: null });
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw Object.assign(
      new Error(`HTTP ${res.status} - non-JSON response: ${text.slice(0, 200)}`),
      { data: text }
    );
  }

  if (!res.ok) throw Object.assign(new Error("HTTP " + res.status), { data: json });
  return json;
}

// ─────────────────────────────────────────────────────────────
// GET USER ID dari username (REST v1.1)
// ─────────────────────────────────────────────────────────────
async function getUserId(username, ct0, auth_token) {
  const url  = `https://api.twitter.com/1.1/users/show.json?screen_name=${username}`;
  const data = await xfetch(url, { headers: makeHeaders(ct0, auth_token) });
  return data.id_str;
}

// ─────────────────────────────────────────────────────────────
// GET FOLLOWERS (REST v1.1 - stable, no graphql ID expiry)
// ─────────────────────────────────────────────────────────────
async function getFollowers(userId, cursor, ct0, auth_token) {
  const params = new URLSearchParams({
    user_id             : userId,
    count               : 200,
    cursor              : cursor ?? -1,
    skip_status         : true,
    include_user_entities: false,
  });

  const url  = `https://api.twitter.com/1.1/followers/list.json?${params}`;
  const data = await xfetch(url, { headers: makeHeaders(ct0, auth_token) });

  const users = (data.users ?? []).map((u) => ({ id: u.id_str, name: u.screen_name }));
  // next_cursor_str == "0" artinya sudah habis
  const nextCursor = data.next_cursor_str !== "0" ? data.next_cursor_str : null;

  return { users, nextCursor };
}

// ─────────────────────────────────────────────────────────────
// FOLLOW user by ID
// ─────────────────────────────────────────────────────────────
async function followUser(userId, ct0, auth_token) {
  const data = await xfetch("https://twitter.com/i/api/1.1/friendships/create.json", {
    method : "POST",
    headers: makeHeaders(ct0, auth_token, true),
    body   : new URLSearchParams({ user_id: userId, skip_status: true }),
  });
  return data;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  const allAccounts = loadAccounts();
  console.log(`\nLoaded ${allAccounts.length} akun dari ${ACCOUNTS_FILE}`);
  allAccounts.forEach((a, i) => console.log(`  ${i + 1}. ${a.label}`));

  console.log(`\nPilih mode:`);
  console.log(`  1. 1 akun`);
  console.log(`  2. Range (dari akun X sampai selesai)`);

  const mode = await prompt(`\nPilihan [1/2]: `);
  let accounts;

  if (mode === "1") {
    const pick = await prompt(`Pilih akun [1-${allAccounts.length}]: `);
    const idx  = parseInt(pick, 10);
    if (isNaN(idx) || idx < 1 || idx > allAccounts.length) {
      console.error(`Akun tidak valid.`); process.exit(1);
    }
    accounts = [allAccounts[idx - 1]];
    console.log(`\n▶ Mode: ${allAccounts[idx - 1].label} aja\n`);

  } else if (mode === "2") {
    const from = await prompt(`Mulai dari akun ke- [1-${allAccounts.length}]: `);
    const idx  = parseInt(from, 10);
    if (isNaN(idx) || idx < 1 || idx > allAccounts.length) {
      console.error(`Angka tidak valid.`); process.exit(1);
    }
    accounts = allAccounts.slice(idx - 1);
    console.log(`\n▶ Mode: akun${idx} → akun${allAccounts.length}\n`);

  } else {
    console.error(`Pilihan tidak valid.`); process.exit(1);
  }

  const progress = loadProgress();

  for (const account of accounts) {
    const { label, ct0, auth_token } = account;
    console.log(`\n╔══════════════════════════════╗`);
    console.log(`║  [${label}] Starting...`);
    console.log(`╚══════════════════════════════╝`);

    if (!progress[label]) progress[label] = { followed: [], cursor: null };
    const state = progress[label];

    let targetId;
    try {
      targetId = await getUserId(TARGET_USERNAME, ct0, auth_token);
      console.log(`[${label}] @${TARGET_USERNAME} → ID: ${targetId}`);
    } catch (err) {
      console.error(`[${label}] Gagal resolve user ID:`, err.data || err.message);
      continue;
    }

    let cursor = state.cursor;
    let count  = 0;

    while (count < FOLLOW_LIMIT) {
      let users, nextCursor;
      try {
        ({ users, nextCursor } = await getFollowers(targetId, cursor, ct0, auth_token));
      } catch (err) {
        console.error(`[${label}] Error fetch followers:`, err.data || err.message);
        break;
      }

      if (!users.length) {
        console.log(`[${label}] Ga ada followers lagi / rate limited.`);
        break;
      }

      for (const user of users) {
        if (state.followed.includes(user.id)) {
          console.log(`  ⊘  skip @${user.name} (already in list)`);
          continue;
        }

        try {
          await followUser(user.id, ct0, auth_token);
          state.followed.push(user.id);
          count++;
          console.log(`  ✓  @${user.name} [${count}/${FOLLOW_LIMIT}]`);
          saveProgress(progress);
        } catch (err) {
          const code = err.data?.errors?.[0]?.code;
          if (code === 160) {
            state.followed.push(user.id);
            console.log(`  ⊘  @${user.name} (already following)`);
          } else if (code === 326) {
            console.error(`  ✗  [${label}] Akun kena challenge/lock! Stop.`);
            saveProgress(progress);
            process.exit(1);
          } else {
            console.error(`  ✗  @${user.name} error:`, err.data || err.message);
          }
        }

        // delay jalan tiap iterasi user, bukan cuma kalau follow berhasil
        const delay = Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1)) + DELAY_MIN_MS;
        console.log(`  ⏱  next in ${(delay / 1000).toFixed(1)}s`);
        await sleep(delay);

        if (count >= FOLLOW_LIMIT) break;
      }

      if (!nextCursor || count >= FOLLOW_LIMIT) break;
      cursor = nextCursor;
      state.cursor = cursor;
      saveProgress(progress);
    }

    console.log(`\n[${label}] Selesai. Follow run ini: ${count}`);
  }

  console.log("\n✅ Semua akun selesai.");
}

main().catch(console.error);
