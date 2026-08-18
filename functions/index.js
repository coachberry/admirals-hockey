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

exports.icsFeed = onRequest(async (req, res) => {
  try {
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

        const location = team === "varsity"
          ? [g.rinkName, g.rinkAddress].filter(Boolean).join(", ")
          : (g.location || "");

        events.push({
          uid: team + "-" + docSnap.id + "@fhsadmiralshockey.com",
          date: g.date,
          time: g.time || "00:00",
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

    events.forEach((e) => {
      const start = fmtICSDateTime(e.date, e.time);
      const startDate = new Date(e.date + "T" + e.time + ":00");
      const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // default 2-hour block
      const pad = (n) => String(n).padStart(2, "0");
      const end = (
        endDate.getFullYear() + pad(endDate.getMonth() + 1) + pad(endDate.getDate()) +
        "T" + pad(endDate.getHours()) + pad(endDate.getMinutes()) + "00"
      );

      ics += "BEGIN:VEVENT\r\n";
      ics += "UID:" + e.uid + "\r\n";
      ics += "DTSTAMP:" + dtstamp + "\r\n";
      ics += "DTSTART:" + start + "\r\n";
      ics += "DTEND:" + end + "\r\n";
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

