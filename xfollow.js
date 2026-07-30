// xfollow.js - Follow followers of a target X account
// Baca akun dari x.txt (auth_token\nct0 per blok, dipisah baris kosong)
// Usage: node xfollow.js

import fs from "fs";

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const TARGET_USERNAME = "moonpay";
const FOLLOW_LIMIT    = 100;
const DELAY_MIN_MS    = 2000;
const DELAY_MAX_MS    = 7000;
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
// GET USER ID dari username
// ─────────────────────────────────────────────────────────────
async function getUserId(username, ct0, auth_token) {
  const vars = encodeURIComponent(
    JSON.stringify({ screen_name: username, withSafetyModeUserFields: true })
  );
  const features = encodeURIComponent(JSON.stringify({
    hidden_profile_subscriptions_enabled                               : true,
    rweb_tipjar_consumption_enabled                                    : true,
    responsive_web_graphql_exclude_directive_enabled                   : true,
    verified_phone_label_enabled                                       : false,
    subscriptions_verification_info_is_identity_verified_enabled       : true,
    subscriptions_verification_info_verified_since_enabled             : true,
    highlights_tweets_tab_ui_enabled                                   : true,
    responsive_web_twitter_article_notes_tab_enabled                   : false,
    creator_subscriptions_tweet_preview_api_enabled                    : true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled  : false,
    responsive_web_graphql_timeline_navigation_enabled                 : true,
  }));

  const url = `https://twitter.com/i/api/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName?variables=${vars}&features=${features}`;
  const data = await xfetch(url, { headers: makeHeaders(ct0, auth_token) });
  return data.data.user.result.rest_id;
}

// ─────────────────────────────────────────────────────────────
// GET FOLLOWERS (paginated)
// ─────────────────────────────────────────────────────────────
async function getFollowers(userId, cursor, ct0, auth_token) {
  const vars = { userId, count: 20, includePromotedContent: false };
  if (cursor) vars.cursor = cursor;

  const features = {
    rweb_tipjar_consumption_enabled                                        : true,
    responsive_web_graphql_exclude_directive_enabled                       : true,
    verified_phone_label_enabled                                           : false,
    creator_subscriptions_tweet_preview_api_enabled                        : true,
    responsive_web_graphql_timeline_navigation_enabled                     : true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled      : false,
    communities_web_enable_tweet_community_results_fetch                   : true,
    c9s_tweet_anatomy_moderator_badge_enabled                              : true,
    articles_preview_enabled                                               : true,
    tweetypie_unmention_optimization_enabled                               : true,
    responsive_web_edit_tweet_api_enabled                                  : true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled             : true,
    view_counts_everywhere_api_enabled                                     : true,
    longform_notetweets_consumption_enabled                                : true,
    responsive_web_twitter_article_tweet_consumption_enabled               : true,
    tweet_awards_web_tipping_enabled                                       : false,
    creator_subscriptions_quote_tweet_preview_enabled                      : false,
    freedom_of_speech_not_reach_fetch_enabled                              : true,
    standardized_nudges_misinfo                                            : true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    rweb_video_timestamps_enabled                                          : true,
    longform_notetweets_rich_text_read_enabled                             : true,
    longform_notetweets_inline_media_enabled                               : true,
    responsive_web_enhance_cards_enabled                                   : false,
  };

  const url = `https://twitter.com/i/api/graphql/rRXFSG5vR6drKr5M37YOTw/Followers?variables=${encodeURIComponent(JSON.stringify(vars))}&features=${encodeURIComponent(JSON.stringify(features))}`;
  const data = await xfetch(url, { headers: makeHeaders(ct0, auth_token) });

  const entries =
    data.data.user.result.timeline.timeline.instructions
      .find((i) => i.type === "TimelineAddEntries")?.entries || [];

  const users = [];
  let nextCursor = null;

  for (const entry of entries) {
    if (entry.entryId.startsWith("user-")) {
      const u = entry.content?.itemContent?.user_results?.result;
      if (u?.rest_id)
        users.push({ id: u.rest_id, name: u.legacy?.screen_name });
    }
    if (entry.entryId === "cursor-bottom-0") {
      nextCursor = entry.content?.value;
    }
  }

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

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  const accounts = loadAccounts();
  console.log(`Loaded ${accounts.length} akun dari ${ACCOUNTS_FILE}`);

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
          const delay = Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1)) + DELAY_MIN_MS;
          console.log(`  ⏱  next in ${(delay / 1000).toFixed(1)}s`);
          await sleep(delay);
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
