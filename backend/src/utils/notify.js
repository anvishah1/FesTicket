// backend/src/utils/notify.js
//
// NOTIF-08: write an in-app notification (shown in the header bell). Guest actions
// have no userId and are simply not recorded. Best-effort — a write failure must
// never break the action that triggered it.

import prisma from "../prisma.js";
import logger from "./logger.js";

export async function createNotification({ userId, type, title, body, linkUrl }) {
  if (!userId) return null;
  try {
    return await prisma.notification.create({
      data: { userId, type, title, body: body ?? null, linkUrl: linkUrl ?? null },
    });
  } catch (err) {
    logger.error({ err, userId, type }, "[notify] createNotification failed");
    return null;
  }
}
