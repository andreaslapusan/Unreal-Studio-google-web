/**
 * Unreal Studio Bali — Cloud Functions
 *
 * Entry point. Each function is exported here so Firebase deploy picks it up.
 * Implementation lives in subdirectories by trigger type.
 */

import { initializeApp } from "firebase-admin/app";

initializeApp();

// HTTP triggers
export { ghlWebhook } from "./http/ghl-webhook";
export { ping } from "./http/ping";

// Firestore triggers
export { onUpdateCreate } from "./triggers/on-update-create";
export { onAuthUserCreate } from "./triggers/on-auth-create";

// Scheduled triggers
export { runEveryThirtyMinutes } from "./scheduled/health-check";
export { weeklyBroadcast } from "./scheduled/weekly-broadcast";
