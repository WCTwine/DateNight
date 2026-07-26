import {
  adminDb,
  authenticatedUser,
  jsonResponse,
  memberDevices,
  sendDataNotification,
  timestamp
} from "./_shared/firebase.mjs";

export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const user = await authenticatedUser(request);
    const { coupleId } = await request.json();
    if (!coupleId || typeof coupleId !== "string") {
      return jsonResponse({ error: "A couple ID is required." }, 400);
    }

    const coupleRef = adminDb.collection("couples").doc(coupleId);
    const coupleSnapshot = await coupleRef.get();
    if (!coupleSnapshot.exists) {
      return jsonResponse({ error: "Shared space not found." }, 404);
    }

    const couple = coupleSnapshot.data();
    if (!couple.members?.includes(user.uid)) {
      return jsonResponse({ error: "You are not a member of this shared space." }, 403);
    }

    const senderName = couple.memberNames?.[user.uid] || "Your partner";
    const devices = await memberDevices(coupleId, user.uid);
    const delivery = await sendDataNotification(devices, {
      title: "DateNight ♡",
      body: "Nooky tonight?",
      tag: "datenight-nooky",
      url: "/",
      coupleId
    });

    const message = await coupleRef.collection("messages").add({
      type: "nooky",
      body: "Nooky tonight?",
      senderUid: user.uid,
      senderName,
      delivered: delivery.delivered,
      status: "pending",
      response: null,
      createdAt: timestamp()
    });

    return jsonResponse({ ...delivery, messageId: message.id });
  } catch (error) {
    console.error("send-nooky failed", error);
    const status = error.message === "Authentication required." ? 401 : 500;
    return jsonResponse({ error: status === 401 ? error.message : "The message could not be sent." }, status);
  }
}
