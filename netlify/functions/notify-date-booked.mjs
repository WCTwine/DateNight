import {
  adminDb,
  authenticatedUser,
  jsonResponse,
  memberDevices,
  sendDataNotification
} from "./_shared/firebase.mjs";

function friendlyDate(value) {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date(`${value}T12:00:00Z`));
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const user = await authenticatedUser(request);
    const { coupleId, dateNightId, action = "booked" } = await request.json();
    if (!coupleId || !dateNightId || !["booked", "updated"].includes(action)) {
      return jsonResponse({ error: "A date night is required." }, 400);
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

    const dateSnapshot = await coupleRef.collection("dateNights").doc(dateNightId).get();
    if (!dateSnapshot.exists) {
      return jsonResponse({ error: "Date night not found." }, 404);
    }

    const dateNight = dateSnapshot.data();
    const senderName = couple.memberNames?.[user.uid] || "Your partner";
    const actionText = action === "updated" ? "updated" : "booked";
    const devices = await memberDevices(coupleId, user.uid);
    const delivery = await sendDataNotification(devices, {
      title: "DateNight ♡",
      body: `${senderName} ${actionText} our date night for ${friendlyDate(dateNight.date)}`,
      tag: `datenight-${actionText}-${dateNightId}`,
      url: "/",
      coupleId
    });

    return jsonResponse(delivery);
  } catch (error) {
    console.error("notify-date-booked failed", error);
    const status = error.message === "Authentication required." ? 401 : 500;
    return jsonResponse({
      error: status === 401 ? error.message : "The booking notification could not be sent."
    }, status);
  }
}
