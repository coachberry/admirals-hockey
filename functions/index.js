const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

const db = admin.firestore();
const messaging = admin.messaging();

// ============================================
// Helper: send push to a list of member UIDs
// ============================================
async function sendPushToMembers(uids, title, body, url) {
  if (!uids.length) return { sent: 0, failed: 0 };

  const membersSnap = await db.getAll(...uids.map((uid) => db.collection("members").doc(uid)));
  const tokens = [];
  membersSnap.forEach((doc) => {
    const data = doc.data();
    if (data && Array.isArray(data.fcmTokens)) {
      tokens.push(...data.fcmTokens);
    }
  });

  if (!tokens.length) return { sent: 0, failed: 0 };

  const message = {
    notification: { title, body },
    webpush: {
      notification: { icon: "/assets/images/admiral-logo.png" },
      fcmOptions: { link: url || "/" },
    },
    tokens: [...new Set(tokens)],
  };

  const response = await messaging.sendEachForMulticast(message);
  return { sent: response.successCount, failed: response.failureCount };
}

// ============================================
// Manual push notification (admin-triggered)
// ============================================
exports.sendManualNotification = onCall(async (request) => {
  const { title, body, url, targetRoles } = request.data;
  const auth = request.auth;

  if (!auth) throw new HttpsError("unauthenticated", "Must be logged in");

  // Verify caller is admin/superadmin
  const callerSnap = await db.collection("members").doc(auth.uid).get();
  const callerData = callerSnap.data();
  const isAdmin = callerData && (callerData.role === "admin" || callerData.role === "superadmin" ||
    (callerData.roles || []).includes("admin") || (callerData.roles || []).includes("superadmin"));
  if (!isAdmin) throw new HttpsError("permission-denied", "Admin access required");

  if (!title || !body) throw new HttpsError("invalid-argument", "Title and body required");

  // Get target members
  const membersSnap = await db.collection("members").get();
  const targetUids = [];
  membersSnap.forEach((doc) => {
    const m = doc.data();
    if (!m.fcmTokens || !m.fcmTokens.length) return;
    if (!targetRoles || !targetRoles.length) {
      targetUids.push(doc.id);
      return;
    }
    const memberRoles = [m.role, ...(m.roles || []), ...(m.teams || [])].filter(Boolean);
    if (memberRoles.some((r) => targetRoles.includes(r))) targetUids.push(doc.id);
  });

  const result = await sendPushToMembers(targetUids, title, body, url);
  logger.info("Manual notification sent", result);
  return result;
});

// ============================================
// Chat @mention push + in-app notification (any authenticated member)
// ============================================
exports.sendMentionNotification = onCall(async (request) => {
  const { targetUid, title, body, url } = request.data;
  const auth = request.auth;

  if (!auth) throw new HttpsError("unauthenticated", "Must be logged in");
  if (!targetUid || !title || !body) {
    throw new HttpsError("invalid-argument", "targetUid, title, and body required");
  }
  if (targetUid === auth.uid) return { sent: 0, failed: 0 }; // don't notify yourself

  const targetSnap = await db.collection("members").doc(targetUid).get();
  if (!targetSnap.exists) throw new HttpsError("not-found", "Target member not found");

  // Write in-app notification
  const nid = Date.now().toString() + Math.random().toString(36).slice(2, 8);
  await db.collection("members").doc(targetUid).collection("notifications").doc(nid).set({
    title, body, url: url || "/", read: false, timestamp: Date.now()
  });

  // Send push
  const result = await sendPushToMembers([targetUid], title, body, url);
  logger.info("Mention notification sent", { targetUid, ...result });
  return result;
});

// ============================================
// Chat message push notification (fires for every new message in a channel,
// to every member with read access, excluding the sender). Push only — does
// NOT write a per-recipient in-app notification-bell entry, since doing that
// for every single message would flood the bell in an active channel.
// ============================================
exports.sendChatMessageNotification = onCall(async (request) => {
  const { channelId, channelName, text, senderName } = request.data;
  const auth = request.auth;

  if (!auth) throw new HttpsError("unauthenticated", "Must be logged in");
  if (!channelId || !text) {
    throw new HttpsError("invalid-argument", "channelId and text required");
  }

  const channelSnap = await db.collection("chatChannels").doc(channelId).get();
  const readRoles = channelSnap.exists ? (channelSnap.data().readRoles || []) : [];

  const membersSnap = await db.collection("members").get();
  const targetUids = [];
  membersSnap.forEach((doc) => {
    if (doc.id === auth.uid) return; // never notify the sender
    const m = doc.data();
    const memberRoles = [m.role, ...(m.roles || []), ...(m.teams || [])].filter(Boolean);
    if (readRoles.length === 0 || memberRoles.some((r) => readRoles.includes(r))) {
      targetUids.push(doc.id);
    }
  });

  if (!targetUids.length) return { sent: 0, failed: 0 };

  const title = (senderName || "Someone") + " in #" + (channelName || "chat");
  const body = String(text).slice(0, 120);

  const result = await sendPushToMembers(targetUids, title, body, "/chat");
  logger.info("Chat message notification sent", { channelId, targetCount: targetUids.length, ...result });
  return result;
});

// ============================================
// Shared helpers for the full server-rendered share pages below
// ============================================
const SITE_URL = "https://fhsadmiralshockey.com";
const DEFAULT_SHARE_IMAGE = SITE_URL + "/assets/images/franklin-admirals-hockey-logo-lowres.png";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(html) {
  return String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDateServer(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatTimeServer(time) {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

function svPctFmtServer(sv, sa) {
  return sa > 0 ? "." + (sv / sa).toFixed(3).slice(2) : ".000";
}

function minToMMSSServer(min) {
  const m = Math.floor(min || 0);
  const s = Math.round(((min || 0) - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Share row: Facebook, LinkedIn, and a Copy Link button. Used on both the
// news post page and the game stats page.
function shareRowHtml(pageUrl) {
  const encoded = encodeURIComponent(pageUrl);
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encoded}`;
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`;
  return `<div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid #eee;display:flex;gap:0.6rem;flex-wrap:wrap;align-items:center;">
    <span style="font-size:0.82rem;color:#666;font-weight:600;">Share:</span>
    <a href="${fbUrl}" target="_blank" rel="noopener noreferrer" style="background:#1877F2;color:white;padding:0.45rem 0.9rem;border-radius:5px;font-size:0.82rem;font-weight:600;text-decoration:none;">Facebook</a>
    <a href="${liUrl}" target="_blank" rel="noopener noreferrer" style="background:#0A66C2;color:white;padding:0.45rem 0.9rem;border-radius:5px;font-size:0.82rem;font-weight:600;text-decoration:none;">LinkedIn</a>
    <button onclick="(function(btn){navigator.clipboard.writeText(${JSON.stringify(pageUrl)}).then(function(){var t=btn.textContent;btn.textContent='Copied!';setTimeout(function(){btn.textContent=t;},1500);});})(this)" style="background:#eee;color:#333;padding:0.45rem 0.9rem;border-radius:5px;font-size:0.82rem;font-weight:600;border:none;cursor:pointer;">Copy Link</button>
  </div>`;
}

// Shared page shell (header/hero/footer scripts) so these pages are genuinely
// part of the site, not standalone stubs - real nav, chat widget, etc.
function pageShell({ title, description, image, pageUrl, ogType, headExtra, bodyHtml }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
<link rel="icon" type="image/png" href="/assets/images/franklin-logo.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#5D1725">
<title>${t} - Franklin Admirals Hockey</title>
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="${ogType || 'website'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${image}">
<link rel="stylesheet" href="/assets/css/styles.css">
${headExtra || ""}
<script src="/assets/js/page-guard.js"></script>
</head>
<body>
<div id="site-header"></div>
<script src="/assets/js/load-hero.js" defer></script>
<script src="/assets/js/load-header.js"></script>

${bodyHtml}

<div id="site-footer"></div>
<script src="/assets/js/load-footer.js"></script>
<script type="module" src="/assets/js/member-auth.js"></script>
<script type="module" src="/assets/js/chat-widget.js"></script>
</body>
</html>`;
}

// ============================================
// News post page (full server-rendered article, real OG tags)
// ============================================
exports.newsPostPage = onRequest(async (req, res) => {
  const postId = req.query.postId;
  if (!postId) { res.status(400).send("Missing postId"); return; }

  try {
    // Slug first (news.slug == postId), then fall back to a direct doc-ID
    // lookup so links already shared with the old raw-ID format keep working.
    let snap = null;
    let resolvedId = postId;
    const slugQuery = await db.collection("news").where("slug", "==", postId).limit(1).get();
    if (!slugQuery.empty) {
      snap = slugQuery.docs[0];
      resolvedId = snap.id;
    } else {
      const byId = await db.collection("news").doc(postId).get();
      if (byId.exists) { snap = byId; resolvedId = byId.id; }
    }
    if (!snap) {
      res.redirect(302, SITE_URL + "/news");
      return;
    }
    const post = snap.data();
    const title = post.title || "Admirals Hockey News";
    const description = post.summary || stripHtml(post.content || "").slice(0, 200) || "Read the latest from Franklin Admirals Hockey.";
    const image = post.imageURL || DEFAULT_SHARE_IMAGE;
    const pageUrl = SITE_URL + "/news/" + encodeURIComponent(post.slug || resolvedId);
    const category = post.category || "";
    const categoryColors = { "Game Report": "#5D1725", "Team Update": "#1565c0", "Announcement": "#e65100", "Player Spotlight": "#2e7d32" };
    const catColor = categoryColors[category] || "#5D1725";

    const bylineHtml = post.authorName
      ? `<div class="article-byline" style="display:flex;">
          <div class="article-byline-left">By <strong class="article-byline-author">${escapeHtml(post.authorName)}</strong> <span class="article-byline-role">${escapeHtml(post.authorTitle || "")}</span></div>
          <div class="article-byline-right"><span class="article-byline-date">${escapeHtml(formatDateServer(post.date))}</span><span class="article-byline-location">${escapeHtml(post.location || "")}</span></div>
        </div>`
      : `<div class="article-modal-date">${escapeHtml(formatDateServer(post.date))}</div>`;

    const imgHtml = post.imageURL
      ? `<div class="article-modal-img"><img src="${post.imageURL}" alt="${escapeHtml(title)}" style="width:100%;height:auto;display:block;"></div>`
      : "";

    const bodyHtml = `
<div class="main-container" style="max-width:800px;margin:0 auto;padding:2rem 1rem 4rem;">
  ${imgHtml}
  <div style="margin-top:1.5rem;">
    ${category ? `<div class="article-modal-category" style="background:${catColor};display:inline-block;">${escapeHtml(category)}</div>` : ""}
    <h1 class="article-modal-title">${escapeHtml(title)}</h1>
    ${bylineHtml}
    <div class="article-modal-content" style="--article-p-spacing:${post.paragraphSpacing ?? 12}px;--article-h-spacing:${post.headingSpacing ?? 16}px;--article-line-height:${post.lineHeight ?? 1.6};">
      ${post.content || ""}
    </div>
    ${shareRowHtml(pageUrl)}
    <div style="margin-top:1.5rem;"><a href="/news" style="color:#5D1725;font-weight:600;text-decoration:none;">&larr; Back to News</a></div>
  </div>
</div>`;

    const headExtra = `<link rel="stylesheet" href="/assets/css/news-styles.css">`;
    const html = pageShell({ title, description, image, pageUrl, ogType: "article", headExtra, bodyHtml });

    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.status(200).send(html);
  } catch (e) {
    logger.error("newsPostPage error:", e);
    res.status(500).send("Error loading post");
  }
});

// ============================================
// Game stats page (full server-rendered box score, real OG tags)
// ============================================
function renderSkaterRowsServer(skaters) {
  if (!skaters.length) return '<tr><td colspan="14" style="text-align:center;color:#999;padding:1rem;">No stats entered</td></tr>';
  return skaters.map((s) => {
    const pts = (s.goals || 0) + (s.assists || 0);
    const pm = (s.plus || 0) - (s.minus || 0);
    return `<tr>
      <td>${escapeHtml(s.number)}</td><td>${escapeHtml(s.name)}</td>
      <td>${s.goals || 0}</td><td>${s.assists || 0}</td><td>${pts}</td>
      <td>${s.ppg || 0}</td><td>${s.ppa || 0}</td><td>${s.shg || 0}</td><td>${s.sha || 0}</td>
      <td>${s.plus || 0}</td><td>${s.minus || 0}</td><td>${pm > 0 ? "+" + pm : pm}</td>
      <td>${s.sog || 0}</td><td>${s.pim || 0}</td>
    </tr>`;
  }).join("");
}

function renderGoalieRowsServer(goalies) {
  if (!goalies.length) return '<tr><td colspan="8" style="text-align:center;color:#999;padding:1rem;">No stats entered</td></tr>';
  const sorted = [...goalies].sort((a, b) => {
    if (a.isEmptyNet) return 1;
    if (b.isEmptyNet) return -1;
    if ((b.gs || 0) !== (a.gs || 0)) return (b.gs || 0) - (a.gs || 0);
    return (b.minutesPlayed || 0) - (a.minutesPlayed || 0);
  });
  return sorted.map((g) => {
    const sv = Math.max(0, (g.shotsAgainst || 0) - (g.goalsAgainst || 0));
    const isEN = g.isEmptyNet;
    return `<tr ${isEN ? 'style="background:#f5f5f5;font-style:italic;"' : ""}>
      <td>${escapeHtml(g.number)}</td><td>${escapeHtml(g.name)}</td>
      <td>${isEN ? "-" : escapeHtml(g.decision || "-")}</td>
      <td>${minToMMSSServer(g.minutesPlayed)}</td>
      <td>${g.shotsAgainst || 0}</td><td>${sv}</td>
      <td>${isEN ? "-" : svPctFmtServer(sv, g.shotsAgainst || 0)}</td>
      <td>${g.goalsAgainst || 0}</td>
    </tr>`;
  }).join("");
}

function gameHeaderHtmlServer(game, teamLabel, hasResult) {
  const homeAway = game.homeAway === "Home" ? "vs." : "@";
  const resultColors = { W: "#2e7d32", OTW: "#2e7d32", SOW: "#2e7d32", L: "#c62828", OTL: "#c62828", SOL: "#c62828", T: "#f57c00" };
  const dateStr = game.date ? new Date(game.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
  const resultHtml = hasResult
    ? `<div style="font-size:1.4rem;font-weight:700;color:${resultColors[game.result] || "#333"};margin-top:0.5rem;">${escapeHtml(game.result)} ${game.teamScore}-${game.opponentScore}</div>`
    : `<div style="font-size:1rem;color:#666;margin-top:0.5rem;">${game.time ? formatTimeServer(game.time) : ""} ${escapeHtml(game.timezone || "")}</div>`;
  return `<div style="text-align:center;padding:1.5rem 0;border-bottom:2px solid #5D1725;">
    <div style="font-size:0.85rem;color:#999;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(teamLabel)}</div>
    <h1 style="font-size:1.8rem;margin:0.5rem 0;color:#333;">Franklin ${homeAway} ${escapeHtml(game.opponent || "TBD")}</h1>
    <div style="color:#666;">${dateStr}</div>
    ${resultHtml}
    ${game.rinkName ? `<div style="color:#999;font-size:0.9rem;margin-top:0.3rem;">${escapeHtml(game.rinkName)}${game.rinkAddress ? " &middot; " + escapeHtml(game.rinkAddress) : ""}</div>` : ""}
  </div>`;
}

exports.gameStatsPage = onRequest(async (req, res) => {
  const team = req.query.team === "jv" ? "jv" : "varsity";
  const seasonId = req.query.seasonId;
  const gameId = req.query.gameId;
  if (!seasonId || !gameId) { res.status(400).send("Missing seasonId or gameId"); return; }

  const scheduleRoot = team === "jv" ? "jv-schedule" : "seasons";
  const scheduleSubcol = team === "jv" ? "games" : "schedule";
  const rosterRoot = team === "jv" ? "jv-roster" : "roster";
  const scheduleUrl = team === "jv" ? "/jv-schedule" : "/schedule";
  const teamLabel = team === "jv" ? "JV" : "Varsity";

  try {
    const gameRef = db.collection(scheduleRoot).doc(seasonId).collection(scheduleSubcol).doc(gameId);
    const gameSnap = await gameRef.get();
    if (!gameSnap.exists) {
      res.redirect(302, SITE_URL + scheduleUrl);
      return;
    }
    const game = gameSnap.data();
    const opponent = game.opponent || "TBD";
    const homeAway = game.homeAway === "Home" ? "vs." : "@";
    const title = `Franklin ${teamLabel} ${homeAway} ${opponent}`;
    const hasResult = game.result && game.teamScore !== undefined && game.opponentScore !== undefined;
    const description = hasResult
      ? `Final: ${game.result} ${game.teamScore}-${game.opponentScore}. Full box score and stats.`
      : `Upcoming ${teamLabel} game vs ${opponent}. Full schedule and stats.`;
    const image = game.opponentLogo || DEFAULT_SHARE_IMAGE;
    const pageUrl = SITE_URL + "/game/" + team + "/" + encodeURIComponent(seasonId) + "/" + encodeURIComponent(gameId);
    const headerHtml = gameHeaderHtmlServer(game, teamLabel, hasResult);

    let statsHtml;
    if (!hasResult) {
      // Upcoming game - no box score yet. Lineups (if published) are a
      // separate, more complex data structure - not rendered here for now.
      statsHtml = `<div style="text-align:center;color:#999;padding:2rem 0;">Stats will be available after the game.</div>`;
    } else {
      const [rosterSnap, skaterSnap, goalieSnap] = await Promise.all([
        db.collection(rosterRoot).doc(seasonId).collection("players").get(),
        gameRef.collection("skaterstats").get(),
        gameRef.collection("goaliestats").get(),
      ]);

      const rosterById = {};
      rosterSnap.forEach((d) => { rosterById[d.id] = d.data(); });

      const skaters = [];
      skaterSnap.forEach((d) => {
        const s = d.data();
        const player = rosterById[s.playerId] || {};
        skaters.push({ ...s, name: player.name || s.name || "?", number: player.number || s.number || "-" });
      });

      const goalies = [];
      goalieSnap.forEach((d) => {
        const g = d.data();
        const player = rosterById[g.playerId] || {};
        goalies.push({ ...g, name: player.name || g.name || "?", number: player.number || g.number || "-", isEmptyNet: g.playerId === "EMPTY_NET" });
      });

      statsHtml = `
      <div style="margin-top:1.5rem;">
        <h3 class="gvm-section-title">Skaters</h3>
        <div class="gvm-table-wrap">
          <table class="game-stats-table">
            <thead><tr>
              <th>#</th><th>Player</th><th>G</th><th>A</th><th>PTS</th>
              <th>PPG</th><th>PPA</th><th>SHG</th><th>SHA</th>
              <th>+</th><th>-</th><th>+/-</th><th>SOG</th><th>PIM</th>
            </tr></thead>
            <tbody>${renderSkaterRowsServer(skaters)}</tbody>
          </table>
        </div>
      </div>
      <div style="margin-top:2rem;">
        <h3 class="gvm-section-title">Goaltenders</h3>
        <div class="gvm-table-wrap">
          <table class="game-stats-table">
            <thead><tr>
              <th>#</th><th>Player</th><th>Dec</th><th>Min</th><th>SA</th><th>SV</th><th>SV%</th><th>GA</th>
            </tr></thead>
            <tbody>${renderGoalieRowsServer(goalies)}</tbody>
          </table>
        </div>
      </div>`;
    }

    const bodyHtml = `
<div class="main-container" style="max-width:900px;margin:0 auto;padding:1rem 1rem 4rem;">
  ${headerHtml}
  ${statsHtml}
  ${shareRowHtml(pageUrl)}
  <div style="margin-top:1.5rem;"><a href="${scheduleUrl}" style="color:#5D1725;font-weight:600;text-decoration:none;">&larr; Back to Schedule</a></div>
</div>`;

    const headExtra = `<link rel="stylesheet" href="/assets/css/schedule-styles.css">
<link rel="stylesheet" href="/assets/css/game-stats.css">`;

    const html = pageShell({ title, description, image, pageUrl, ogType: "website", headExtra, bodyHtml });

    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.status(200).send(html);
  } catch (e) {
    logger.error("gameStatsPage error:", e);
    res.status(500).send("Error loading game");
  }
});

// ============================================
// Scheduled RSVP reminder check (daily at 9am Central)
// ============================================
exports.rsvpReminderCheck = onSchedule(
  { schedule: "0 9 * * *", timeZone: "America/Chicago" },
  async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    logger.info("Checking for events on", tomorrowStr);

    // Check team events happening tomorrow
    const eventsSnap = await db.collection("teamEvents").where("date", "==", tomorrowStr).get();
    for (const eventDoc of eventsSnap.docs) {
      const event = eventDoc.data();
      const invitedRoles = event.invitedRoles || [];
      if (!invitedRoles.length) continue;

      const rsvpSnap = await eventDoc.ref.collection("rsvps").get();
      const respondedUids = new Set();
      rsvpSnap.forEach((r) => respondedUids.add(r.id));

      const membersSnap = await db.collection("members").get();
      const remindUids = [];
      membersSnap.forEach((doc) => {
        const m = doc.data();
        if (respondedUids.has(doc.id)) return;
        const memberRoles = [m.role, ...(m.roles || []), ...(m.teams || [])].filter(Boolean);
        if (memberRoles.some((r) => invitedRoles.includes(r))) remindUids.push(doc.id);
      });

      if (remindUids.length) {
        await sendPushToMembers(
          remindUids,
          "RSVP Reminder",
          `Don't forget to RSVP for "${event.name}" tomorrow!`,
          "/events"
        );
        logger.info(`Sent RSVP reminders for event ${event.name} to ${remindUids.length} members`);
      }
    }

    // Check varsity games happening tomorrow
    const seasonsSnap = await db.collection("seasons").where("current", "==", true).get();
    for (const seasonDoc of seasonsSnap.docs) {
      const gamesSnap = await seasonDoc.ref.collection("schedule").where("date", "==", tomorrowStr).get();
      for (const gameDoc of gamesSnap.docs) {
        const game = gameDoc.data();
        const rsvpSnap = await gameDoc.ref.collection("rsvps").get();
        const respondedUids = new Set();
        rsvpSnap.forEach((r) => respondedUids.add(r.id));

        const rosterSnap = await db.collection("roster").doc(seasonDoc.id).collection("players").get();
        const remindUids = [];
        rosterSnap.forEach((p) => {
          const player = p.data();
          if (player.memberUid && !respondedUids.has(player.memberUid)) {
            remindUids.push(player.memberUid);
          }
        });

        if (remindUids.length) {
          await sendPushToMembers(
            remindUids,
            "Game RSVP Reminder",
            `Don't forget to RSVP for tomorrow's game vs ${game.opponent || "TBD"}!`,
            "/profile"
          );
          logger.info(`Sent game RSVP reminders to ${remindUids.length} players`);
        }
      }
    }

    logger.info("RSVP reminder check complete");
  }
);

// ============================================
// Calendar subscription feed (iCal / .ics) — public HTTP endpoint, no auth.
// Calendar apps (Google/Apple/Outlook/Yahoo) periodically re-fetch this URL on
// their own, so it stays in sync automatically as the schedule is edited.
// Query params: team=varsity|jv, type=games|all (all = games + practices)
// ============================================
function escapeICS(str) {
  return String(str || "").replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
}

function fmtICSDateTime(dateStr, timeStr) {
  const d = new Date(dateStr + "T" + (timeStr || "00:00") + ":00");
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
    "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00"
  );
}

function vtimezoneBlock() {
  let s = "BEGIN:VTIMEZONE\r\n";
  s += "TZID:America/Chicago\r\n";
  s += "BEGIN:DAYLIGHT\r\n";
  s += "TZOFFSETFROM:-0600\r\n";
  s += "TZOFFSETTO:-0500\r\n";
  s += "TZNAME:CDT\r\n";
  s += "DTSTART:19700308T020000\r\n";
  s += "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\n";
  s += "END:DAYLIGHT\r\n";
  s += "BEGIN:STANDARD\r\n";
  s += "TZOFFSETFROM:-0500\r\n";
  s += "TZOFFSETTO:-0600\r\n";
  s += "TZNAME:CST\r\n";
  s += "DTSTART:19701101T020000\r\n";
  s += "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\n";
  s += "END:STANDARD\r\n";
  s += "END:VTIMEZONE\r\n";
  return s;
}

exports.icsFeed = onRequest(async (req, res) => {
  try {
    // Single Team Event mode — used by the "Add to Calendar" buttons on the Events page.
    if (req.query.eventId) {
      const eventDoc = await db.collection("teamEvents").doc(req.query.eventId).get();
      if (!eventDoc.exists) {
        res.status(404).send("Event not found");
        return;
      }
      const ev = eventDoc.data();
      if (!ev.date) {
        res.status(400).send("Event has no date");
        return;
      }
      const time = ev.time || "00:00";
      const start = fmtICSDateTime(ev.date, time);
      const end = ev.endTime
        ? fmtICSDateTime(ev.date, ev.endTime)
        : (() => {
          const startDate = new Date(ev.date + "T" + time + ":00");
          const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // default 2-hour block
          const pad = (n) => String(n).padStart(2, "0");
          return (
            endDate.getFullYear() + pad(endDate.getMonth() + 1) + pad(endDate.getDate()) +
            "T" + pad(endDate.getHours()) + pad(endDate.getMinutes()) + "00"
          );
        })();
      const now = new Date();
      const dtstamp = fmtICSDateTime(now.toISOString().split("T")[0], now.toISOString().split("T")[1].slice(0, 5)) + "Z";

      let ics = "BEGIN:VCALENDAR\r\n";
      ics += "VERSION:2.0\r\n";
      ics += "PRODID:-//Franklin Admirals Hockey//Team Event//EN\r\n";
      ics += "CALSCALE:GREGORIAN\r\n";
      ics += "METHOD:PUBLISH\r\n";
      ics += vtimezoneBlock();
      ics += "BEGIN:VEVENT\r\n";
      ics += "UID:teamevent-" + req.query.eventId + "@fhsadmiralshockey.com\r\n";
      ics += "DTSTAMP:" + dtstamp + "\r\n";
      ics += "DTSTART;TZID=America/Chicago:" + start + "\r\n";
      ics += "DTEND;TZID=America/Chicago:" + end + "\r\n";
      ics += "SUMMARY:" + escapeICS(ev.name || "Team Event") + "\r\n";
      if (ev.location) ics += "LOCATION:" + escapeICS(ev.location) + "\r\n";
      if (ev.description) ics += "DESCRIPTION:" + escapeICS(ev.description) + "\r\n";
      ics += "END:VEVENT\r\n";
      ics += "END:VCALENDAR\r\n";

      res.set("Content-Type", "text/calendar; charset=utf-8");
      res.set("Content-Disposition", "inline; filename=event.ics");
      res.status(200).send(ics);
      return;
    }

    const team = req.query.team === "jv" ? "jv" : "varsity";
    const gamesOnly = req.query.type === "games";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const events = [];
    const seasonsSnap = await db.collection("seasons").get();

    for (const seasonDoc of seasonsSnap.docs) {
      const seasonId = seasonDoc.id;
      const gamesSnap = team === "varsity"
        ? await db.collection("seasons").doc(seasonId).collection("schedule").get()
        : await db.collection("jv-schedule").doc(seasonId).collection("games").get();

      gamesSnap.forEach((docSnap) => {
        const g = docSnap.data();
        if (!g.date) return;
        const eventDateTime = new Date(g.date + "T" + (g.time || "00:00") + ":00");
        if (eventDateTime < today) return;

        const isPractice = g.gameType === "Practice";
        if (gamesOnly && isPractice) return;

        const summary = isPractice
          ? (g.notes || "Team Practice")
          : ("vs " + (g.opponent || "TBD"));

        const location = [g.rinkName, g.rinkAddress].filter(Boolean).join(", ");

        events.push({
          uid: team + "-" + docSnap.id + "@fhsadmiralshockey.com",
          date: g.date,
          time: g.time || "00:00",
          endTime: g.endTime || "",
          isPractice,
          summary: (isPractice ? "Practice: " : "") + summary + (isPractice ? "" : (team === "jv" ? " (JV)" : " (Varsity)")),
          location,
        });
      });
    }

    const now = new Date();
    const dtstamp = fmtICSDateTime(now.toISOString().split("T")[0], now.toISOString().split("T")[1].slice(0, 5)) + "Z";

    const calName = "Franklin Admirals " + (team === "jv" ? "JV" : "Varsity") + " " + (gamesOnly ? "Games" : "Schedule");

    let ics = "BEGIN:VCALENDAR\r\n";
    ics += "VERSION:2.0\r\n";
    ics += "PRODID:-//Franklin Admirals Hockey//Schedule//EN\r\n";
    ics += "CALSCALE:GREGORIAN\r\n";
    ics += "METHOD:PUBLISH\r\n";
    ics += "X-WR-CALNAME:" + escapeICS(calName) + "\r\n";
    ics += "REFRESH-INTERVAL;VALUE=DURATION:PT6H\r\n";
    ics += "X-PUBLISHED-TTL:PT6H\r\n";

    // Explicit timezone definition — without this, some calendar apps (notably Google)
    // treat our times as UTC instead of local Central Time, showing events ~5-6 hours early.
    ics += "BEGIN:VTIMEZONE\r\n";
    ics += "TZID:America/Chicago\r\n";
    ics += "BEGIN:DAYLIGHT\r\n";
    ics += "TZOFFSETFROM:-0600\r\n";
    ics += "TZOFFSETTO:-0500\r\n";
    ics += "TZNAME:CDT\r\n";
    ics += "DTSTART:19700308T020000\r\n";
    ics += "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\n";
    ics += "END:DAYLIGHT\r\n";
    ics += "BEGIN:STANDARD\r\n";
    ics += "TZOFFSETFROM:-0500\r\n";
    ics += "TZOFFSETTO:-0600\r\n";
    ics += "TZNAME:CST\r\n";
    ics += "DTSTART:19701101T020000\r\n";
    ics += "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\n";
    ics += "END:STANDARD\r\n";
    ics += "END:VTIMEZONE\r\n";

    events.forEach((e) => {
      const start = fmtICSDateTime(e.date, e.time);
      // Use the real end time if one was entered; otherwise default by event type:
      // practices run 1 hour, games run 1.5 hours.
      const end = e.endTime
        ? fmtICSDateTime(e.date, e.endTime)
        : (() => {
          const defaultMs = (e.isPractice ? 60 : 90) * 60 * 1000;
          const startDate = new Date(e.date + "T" + e.time + ":00");
          const endDate = new Date(startDate.getTime() + defaultMs);
          const pad = (n) => String(n).padStart(2, "0");
          return (
            endDate.getFullYear() + pad(endDate.getMonth() + 1) + pad(endDate.getDate()) +
            "T" + pad(endDate.getHours()) + pad(endDate.getMinutes()) + "00"
          );
        })();

      ics += "BEGIN:VEVENT\r\n";
      ics += "UID:" + e.uid + "\r\n";
      ics += "DTSTAMP:" + dtstamp + "\r\n";
      ics += "DTSTART;TZID=America/Chicago:" + start + "\r\n";
      ics += "DTEND;TZID=America/Chicago:" + end + "\r\n";
      ics += "SUMMARY:" + escapeICS(e.summary) + "\r\n";
      if (e.location) ics += "LOCATION:" + escapeICS(e.location) + "\r\n";
      ics += "END:VEVENT\r\n";
    });

    ics += "END:VCALENDAR\r\n";

    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Content-Disposition", "inline; filename=admirals-schedule.ics");
    res.set("Cache-Control", "public, max-age=1800"); // 30 min edge cache, keeps feed reasonably fresh
    res.status(200).send(ics);
  } catch (err) {
    logger.error("icsFeed error:", err);
    res.status(500).send("Error generating calendar feed");
  }
});

