const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
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
