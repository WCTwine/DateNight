import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");
  }
  return JSON.parse(raw);
}

const adminApp = getApps()[0] || initializeApp({
  credential: cert(serviceAccount())
});

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminMessaging = getMessaging(adminApp);
export const timestamp = FieldValue.serverTimestamp;

export async function authenticatedUser(request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    throw new Error("Authentication required.");
  }
  return adminAuth.verifyIdToken(header.slice(7));
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function memberDevices(coupleId, excludedUid = null) {
  const snapshot = await adminDb
    .collection("couples")
    .doc(coupleId)
    .collection("devices")
    .get();

  return snapshot.docs
    .map(device => ({ id: device.id, ...device.data() }))
    .filter(device => device.token && device.uid !== excludedUid);
}

export async function sendDataNotification(devices, data) {
  if (!devices.length) return { delivered: 0, failed: 0 };

  const result = await adminMessaging.sendEachForMulticast({
    tokens: devices.map(device => device.token),
    data,
    webpush: {
      headers: { Urgency: "high" },
      fcmOptions: { link: data.url || "/" }
    }
  });

  const invalidTokenCodes = new Set([
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered"
  ]);
  await Promise.all(result.responses.map((response, index) => {
    if (response.success || !invalidTokenCodes.has(response.error?.code)) return null;
    return adminDb
      .collection("couples")
      .doc(data.coupleId)
      .collection("devices")
      .doc(devices[index].id)
      .delete();
  }));

  return {
    delivered: result.successCount,
    failed: result.failureCount
  };
}
