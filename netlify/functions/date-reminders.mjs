import {
  adminDb,
  memberDevices,
  sendDataNotification,
  timestamp
} from "./_shared/firebase.mjs";

function johannesburgDate() {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default async function handler() {
  const today = johannesburgDate();
  let checked = 0;
  let reminded = 0;

  try {
    const couples = await adminDb.collection("couples").get();
    for (const coupleSnapshot of couples.docs) {
      const dateNights = await coupleSnapshot.ref
        .collection("dateNights")
        .where("date", "==", today)
        .get();

      checked += dateNights.size;
      const unsentDates = dateNights.docs.filter(
        dateNight => dateNight.data().reminderSentFor !== today
      );
      if (!unsentDates.length) continue;

      const devices = await memberDevices(coupleSnapshot.id);
      const delivery = await sendDataNotification(devices, {
        title: "DateNight ♡",
        body: "Looking forward to our date tonight x",
        tag: `datenight-reminder-${today}`,
        url: "/",
        coupleId: coupleSnapshot.id
      });

      await Promise.all(unsentDates.map(dateNight => dateNight.ref.update({
          reminderSentFor: today,
          reminderSentAt: timestamp(),
          reminderDeliveryCount: delivery.delivered
      })));
      reminded += delivery.delivered;
    }
    console.log(`DateNight reminder run: ${checked} date(s), ${reminded} notification(s).`);
  } catch (error) {
    console.error("date-reminders failed", error);
    throw error;
  }
}
