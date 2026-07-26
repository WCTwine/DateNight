import {
  adminDb,
  authenticatedUser,
  jsonResponse,
  memberDevices,
  sendDataNotification,
  timestamp
} from "./_shared/firebase.mjs";

const responseLabels = {
  ok: "OK",
  "not-tonight": "Not tonight"
};

export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const user = await authenticatedUser(request);
    const { coupleId, messageId, response } = await request.json();
    const responseLabel = responseLabels[response];

    if (!coupleId || !messageId || !responseLabel) {
      return jsonResponse({ error: "A valid reply is required." }, 400);
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

    const messageRef = coupleRef.collection("messages").doc(messageId);
    const messageSnapshot = await messageRef.get();
    if (!messageSnapshot.exists || messageSnapshot.data().type !== "nooky") {
      return jsonResponse({ error: "Message not found." }, 404);
    }

    const message = messageSnapshot.data();
    if (message.senderUid === user.uid) {
      return jsonResponse({ error: "You cannot reply to your own message." }, 403);
    }
    if (message.status === "responded") {
      return jsonResponse({ error: "This message has already been answered." }, 409);
    }

    const responderName = couple.memberNames?.[user.uid] || "Your partner";
    await messageRef.update({
      status: "responded",
      response,
      responderUid: user.uid,
      responderName,
      respondedAt: timestamp()
    });

    const devices = await memberDevices(coupleId, user.uid);
    const delivery = await sendDataNotification(devices, {
      title: "DateNight ♡",
      body: `${responderName} replied: ${responseLabel}`,
      tag: `datenight-nooky-response-${messageId}`,
      url: "/",
      coupleId
    });

    return jsonResponse(delivery);
  } catch (error) {
    console.error("respond-nooky failed", error);
    const status = error.message === "Authentication required." ? 401 : 500;
    return jsonResponse({
      error: status === 401 ? error.message : "The reply could not be sent."
    }, status);
  }
}
