import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging.js";

const config = globalThis.DATE_NIGHT_FIREBASE;
const configurationPanel = document.getElementById("configuration-panel");
const joinPanel = document.getElementById("join-panel");
const appContent = document.getElementById("app-content");
const settingsButton = document.getElementById("settings-button");
const toastElement = document.getElementById("toast");
const alphabetElement = document.getElementById("alphabet");
const bookingForm = document.getElementById("booking-form");
const codeDialog = document.getElementById("code-dialog");
const settingsDialog = document.getElementById("settings-dialog");

const localKeys = {
  coupleId: "datenight_couple_id",
  coupleCode: "datenight_couple_code",
  displayName: "datenight_display_name"
};

const state = {
  user: null,
  coupleId: localStorage.getItem(localKeys.coupleId),
  coupleCode: localStorage.getItem(localKeys.coupleCode),
  displayName: localStorage.getItem(localKeys.displayName) || "",
  couple: null,
  dates: [],
  selectedLetter: "A",
  editingId: null,
  installPrompt: null,
  unsubscribers: [],
  messaging: null,
  serviceWorkerRegistration: null
};

function isConfigured() {
  const firebaseValues = Object.values(config?.firebaseConfig || {});
  return Boolean(
    firebaseValues.length >= 6 &&
    firebaseValues.every(value => value && !String(value).startsWith("PASTE_")) &&
    config?.vapidKey &&
    !config.vapidKey.startsWith("PASTE_")
  );
}

function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toastElement.classList.remove("show"), 2700);
}

function setBusy(button, busy, busyLabel) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.label;
}

function todayString() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function dateFromString(value) {
  return new Date(`${value}T12:00:00`);
}

function daysBetween(from, to) {
  return Math.round((dateFromString(to) - dateFromString(from)) / 86400000);
}

function formatDate(value, includeYear = true) {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" } : {})
  }).format(dateFromString(value));
}

function generateCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, byte => characters[byte % characters.length]).join("");
}

function sanitiseName(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, 24);
}

function currentDisplayName() {
  return sanitiseName(
    document.getElementById("display-name").value || state.displayName
  );
}

function partnerName() {
  if (!state.couple || !state.user) return "your partner";
  const otherUid = state.couple.members.find(uid => uid !== state.user.uid);
  return otherUid ? state.couple.memberNames?.[otherUid] || "your partner" : "your partner";
}

function persistMembership(coupleId, coupleCode, name) {
  state.coupleId = coupleId;
  state.coupleCode = coupleCode;
  state.displayName = name;
  localStorage.setItem(localKeys.coupleId, coupleId);
  localStorage.setItem(localKeys.coupleCode, coupleCode);
  localStorage.setItem(localKeys.displayName, name);
}

function clearMembership() {
  state.coupleId = null;
  state.coupleCode = null;
  state.couple = null;
  state.dates = [];
  localStorage.removeItem(localKeys.coupleId);
  localStorage.removeItem(localKeys.coupleCode);
  state.unsubscribers.forEach(unsubscribe => unsubscribe());
  state.unsubscribers = [];
}

function renderAlphabet() {
  alphabetElement.replaceChildren();
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(letter => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "letter-button";
    button.textContent = letter;
    button.setAttribute("aria-label", `${letter} theme`);
    button.setAttribute("aria-pressed", String(letter === state.selectedLetter));
    button.addEventListener("click", () => {
      state.selectedLetter = letter;
      renderAlphabet();
    });
    alphabetElement.append(button);
  });
}

function renderMembership() {
  joinPanel.hidden = true;
  appContent.hidden = false;
  settingsButton.hidden = false;
  document.getElementById("connection-label").textContent =
    state.couple?.members?.length > 1
      ? `Connected with ${partnerName()}`
      : "Waiting for your partner";
  document.getElementById("couple-code-display").textContent =
    state.couple?.inviteCode || state.coupleCode || "—";
  document.getElementById("settings-name").value = state.displayName;
}

function renderNextDate() {
  const next = state.dates.find(item => item.date >= todayString());
  const empty = document.getElementById("next-date-empty");
  const details = document.getElementById("next-date-details");
  const letter = document.getElementById("next-letter");

  if (!next) {
    empty.hidden = false;
    details.hidden = true;
    letter.hidden = true;
    return;
  }

  empty.hidden = true;
  details.hidden = false;
  letter.hidden = false;
  letter.textContent = next.letter;

  const difference = daysBetween(todayString(), next.date);
  document.getElementById("countdown-number").textContent = Math.abs(difference);
  document.getElementById("countdown-label").textContent =
    difference === 0 ? "tonight is the night" :
    difference === 1 ? "day to go" :
    difference > 1 ? "days to go" :
    `${Math.abs(difference)} days ago`;
  document.getElementById("next-date-title").textContent =
    difference === 0 ? "Tonight" : `${next.letter} is for us`;
  document.getElementById("next-date-line").textContent =
    `${formatDate(next.date)} · ${next.time}`;
  document.getElementById("next-dinner").textContent = next.dinner;
  document.getElementById("next-activity").textContent = next.activity;
  document.getElementById("next-bedroom").textContent = next.bedroom;
  document.getElementById("edit-next-button").dataset.id = next.id;
  document.getElementById("delete-next-button").dataset.id = next.id;
}

function renderHistory() {
  const history = state.dates
    .filter(item => item.date < todayString())
    .sort((a, b) => b.date.localeCompare(a.date));
  const list = document.getElementById("history-list");
  list.replaceChildren();

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "Your past date nights will appear here.";
    list.append(empty);
  } else {
    history.forEach(item => {
      const row = document.createElement("article");
      row.className = "history-item";

      const letter = document.createElement("span");
      letter.className = "history-letter";
      letter.textContent = item.letter;

      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${item.dinner} · ${item.activity}`;
      const detail = document.createElement("p");
      detail.textContent = `${item.letter}-themed date night`;
      copy.append(title, detail);

      const time = document.createElement("time");
      time.dateTime = item.date;
      time.textContent = new Intl.DateTimeFormat("en-ZA", {
        day: "numeric",
        month: "short"
      }).format(dateFromString(item.date));

      row.append(letter, copy, time);
      list.append(row);
    });
  }

  const chronologicalDates = [...new Set(history.map(item => item.date))].sort();
  const gaps = chronologicalDates.slice(1).map((date, index) =>
    daysBetween(chronologicalDates[index], date)
  );
  const average = gaps.length
    ? gaps.reduce((total, gap) => total + gap, 0) / gaps.length
    : null;
  document.getElementById("average-days").textContent =
    average === null ? "—" : Number.isInteger(average) ? average : average.toFixed(1);
}

function renderDates() {
  renderNextDate();
  renderHistory();
}

function resetBookingForm() {
  state.editingId = null;
  state.selectedLetter = "A";
  bookingForm.reset();
  document.getElementById("date-input").value = todayString();
  document.getElementById("date-input").min = todayString();
  document.getElementById("time-input").value = "19:00";
  document.getElementById("booking-heading").textContent = "Book a date night";
  document.getElementById("save-date-button").textContent = "Book our date night";
  document.getElementById("cancel-edit-button").hidden = true;
  renderAlphabet();
}

function editDateNight(id) {
  const item = state.dates.find(date => date.id === id);
  if (!item) return;
  state.editingId = id;
  state.selectedLetter = item.letter;
  document.getElementById("date-input").value = item.date;
  document.getElementById("time-input").value = item.time;
  document.getElementById("dinner-input").value = item.dinner;
  document.getElementById("activity-input").value = item.activity;
  document.getElementById("bedroom-input").value = item.bedroom;
  document.getElementById("booking-heading").textContent = "Edit date night";
  document.getElementById("save-date-button").textContent = "Save our changes";
  document.getElementById("cancel-edit-button").hidden = false;
  renderAlphabet();
  bookingForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function createCouple() {
  const name = currentDisplayName();
  if (!name) {
    showToast("Add your name first");
    return;
  }
  const button = document.getElementById("create-space-button");
  setBusy(button, true, "Creating…");

  try {
    let code;
    let inviteRef;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = generateCode();
      inviteRef = doc(db, "inviteCodes", code);
      if (!(await getDoc(inviteRef)).exists()) break;
    }
    if (!code || !inviteRef) throw new Error("Could not create a unique code.");

    const coupleRef = doc(collection(db, "couples"));
    const batch = writeBatch(db);
    batch.set(coupleRef, {
      inviteCode: code,
      members: [state.user.uid],
      memberNames: { [state.user.uid]: name },
      createdBy: state.user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.set(inviteRef, {
      coupleId: coupleRef.id,
      ownerUid: state.user.uid,
      createdAt: serverTimestamp()
    });
    await batch.commit();

    persistMembership(coupleRef.id, code, name);
    await enterCouple();
    codeDialog.showModal();
    showToast("Your private space is ready");
  } catch (error) {
    console.error(error);
    showToast("Could not create your space yet");
  } finally {
    setBusy(button, false);
  }
}

async function joinCouple(quiet = false) {
  const name = currentDisplayName();
  const code = (
    document.getElementById("couple-code-input").value ||
    state.coupleCode ||
    ""
  ).trim().toUpperCase();

  if (!name) {
    if (!quiet) showToast("Add your name first");
    return false;
  }
  if (code.length < 6) {
    if (!quiet) showToast("Enter the couple code");
    return false;
  }

  const button = document.getElementById("join-space-button");
  if (!quiet) setBusy(button, true, "Joining…");

  try {
    const invite = await getDoc(doc(db, "inviteCodes", code));
    if (!invite.exists()) throw new Error("Code not found.");
    const coupleId = invite.data().coupleId;
    const coupleRef = doc(db, "couples", coupleId);
    await updateDoc(coupleRef, {
      members: arrayUnion(state.user.uid),
      [`memberNames.${state.user.uid}`]: name,
      updatedAt: serverTimestamp()
    });
    persistMembership(coupleId, code, name);
    await enterCouple();
    if (!quiet) showToast("You’re connected");
    return true;
  } catch (error) {
    console.error(error);
    if (!quiet) showToast("That code is invalid or already has two people");
    return false;
  } finally {
    if (!quiet) setBusy(button, false);
  }
}

async function enterCouple() {
  if (!state.user || !state.coupleId) return;
  state.unsubscribers.forEach(unsubscribe => unsubscribe());
  state.unsubscribers = [];

  const coupleRef = doc(db, "couples", state.coupleId);
  let snapshot;
  try {
    snapshot = await getDoc(coupleRef);
  } catch {
    if (state.coupleCode && state.displayName) {
      document.getElementById("display-name").value = state.displayName;
      if (await joinCouple(true)) return;
    }
    clearMembership();
    showJoinPanel();
    return;
  }

  if (!snapshot.exists() || !snapshot.data().members.includes(state.user.uid)) {
    if (state.coupleCode && state.displayName) {
      document.getElementById("display-name").value = state.displayName;
      if (await joinCouple(true)) return;
    }
    clearMembership();
    showJoinPanel();
    return;
  }

  state.couple = { id: snapshot.id, ...snapshot.data() };
  renderMembership();

  state.unsubscribers.push(onSnapshot(coupleRef, nextSnapshot => {
    if (!nextSnapshot.exists()) return;
    state.couple = { id: nextSnapshot.id, ...nextSnapshot.data() };
    renderMembership();
  }));

  const dateQuery = query(
    collection(db, "couples", state.coupleId, "dateNights"),
    orderBy("date", "asc")
  );
  state.unsubscribers.push(onSnapshot(dateQuery, querySnapshot => {
    state.dates = querySnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    renderDates();
  }, error => {
    console.error(error);
    showToast("Could not refresh your plans");
  }));

  await updateNotificationState();
}

function showJoinPanel() {
  configurationPanel.hidden = true;
  appContent.hidden = true;
  settingsButton.hidden = true;
  joinPanel.hidden = false;
  document.getElementById("display-name").value = state.displayName;
}

async function saveDateNight(event) {
  event.preventDefault();
  if (!state.coupleId || !state.user) return;

  const button = document.getElementById("save-date-button");
  const wasEditing = Boolean(state.editingId);
  setBusy(button, true, "Saving…");
  try {
    const dateNightRef = state.editingId
      ? doc(db, "couples", state.coupleId, "dateNights", state.editingId)
      : doc(collection(db, "couples", state.coupleId, "dateNights"));
    const existing = state.dates.find(item => item.id === state.editingId);

    await setDoc(dateNightRef, {
      coupleId: state.coupleId,
      date: document.getElementById("date-input").value,
      time: document.getElementById("time-input").value,
      letter: state.selectedLetter,
      dinner: document.getElementById("dinner-input").value.trim(),
      activity: document.getElementById("activity-input").value.trim(),
      bedroom: document.getElementById("bedroom-input").value.trim(),
      createdBy: existing?.createdBy || state.user.uid,
      createdAt: existing?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      reminderSentFor: existing?.date === document.getElementById("date-input").value
        ? existing.reminderSentFor || null
        : null
    }, { merge: true });

    resetBookingForm();
    showToast(wasEditing ? "Date night updated" : "Date night booked");
    document.getElementById("next-date-card").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    console.error(error);
    showToast("Could not save the date night");
  } finally {
    setBusy(button, false);
  }
}

async function deleteDateNight(id) {
  const item = state.dates.find(date => date.id === id);
  if (!item || !window.confirm(`Cancel the date night on ${formatDate(item.date)}?`)) return;
  try {
    await deleteDoc(doc(db, "couples", state.coupleId, "dateNights", id));
    showToast("Date night cancelled");
  } catch (error) {
    console.error(error);
    showToast("Could not cancel that date");
  }
}

async function sendNookyMessage() {
  if (!state.coupleId || !state.user) return;
  if (state.couple?.members?.length < 2) {
    showToast("Your partner needs to join first");
    return;
  }
  if (!window.confirm(`Send “Nooky tonight?” to ${partnerName()}?`)) return;

  const button = document.getElementById("nooky-button");
  setBusy(button, true, "Sending…");
  try {
    const token = await state.user.getIdToken();
    const response = await fetch("/api/nooky", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ coupleId: state.coupleId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not send.");
    showToast(data.delivered
      ? `Sent to ${partnerName()} ♡`
      : `Saved, but ${partnerName()} still needs to enable notifications`);
  } catch (error) {
    console.error(error);
    showToast("Could not send the message");
  } finally {
    setBusy(button, false);
  }
}

async function updateNotificationState() {
  const card = document.getElementById("notification-card");
  const copy = document.getElementById("notification-copy");
  const button = document.getElementById("notification-button");

  if (!("Notification" in window)) {
    copy.textContent = "This browser does not support notifications.";
    button.hidden = true;
    return;
  }
  if (Notification.permission === "granted") {
    card.classList.add("enabled");
    copy.textContent = "Notifications are enabled on this phone.";
    button.textContent = "Enabled";
    button.disabled = true;
    await registerPushToken();
  } else if (Notification.permission === "denied") {
    copy.textContent = "Notifications are blocked. Allow them in Chrome’s site settings.";
    button.textContent = "Blocked";
    button.disabled = true;
  }
}

async function enableNotifications() {
  const button = document.getElementById("notification-button");
  setBusy(button, true, "Enabling…");
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      showToast("Notifications were not enabled");
      return;
    }
    await registerPushToken();
    showToast("Notifications enabled on this phone");
  } catch (error) {
    console.error(error);
    showToast("Could not enable notifications");
  } finally {
    setBusy(button, false);
    await updateNotificationState();
  }
}

async function registerPushToken() {
  if (!state.user || !state.coupleId || Notification.permission !== "granted") return;
  if (!(await isSupported())) return;

  state.serviceWorkerRegistration ||= await navigator.serviceWorker.ready;
  state.messaging ||= getMessaging(firebaseApp);
  const token = await getToken(state.messaging, {
    vapidKey: config.vapidKey,
    serviceWorkerRegistration: state.serviceWorkerRegistration
  });
  if (!token) return;

  await setDoc(doc(db, "couples", state.coupleId, "devices", state.user.uid), {
    uid: state.user.uid,
    token,
    displayName: state.displayName,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function saveSettings() {
  const name = sanitiseName(document.getElementById("settings-name").value);
  if (!name) {
    showToast("Your name cannot be empty");
    return;
  }
  try {
    await updateDoc(doc(db, "couples", state.coupleId), {
      [`memberNames.${state.user.uid}`]: name,
      updatedAt: serverTimestamp()
    });
    state.displayName = name;
    localStorage.setItem(localKeys.displayName, name);
    settingsDialog.close();
    showToast("Name updated");
  } catch (error) {
    console.error(error);
    showToast("Could not update your name");
  }
}

async function leaveSpace() {
  if (!window.confirm("Leave this shared space on this phone? Your partner will keep the existing plans.")) return;
  try {
    await deleteDoc(doc(db, "couples", state.coupleId, "devices", state.user.uid));
    await updateDoc(doc(db, "couples", state.coupleId), {
      members: arrayRemove(state.user.uid),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.warn(error);
  }
  settingsDialog.close();
  clearMembership();
  showJoinPanel();
}

function wireInterface() {
  renderAlphabet();
  resetBookingForm();

  document.getElementById("create-space-button").addEventListener("click", createCouple);
  document.getElementById("join-space-button").addEventListener("click", () => joinCouple(false));
  bookingForm.addEventListener("submit", saveDateNight);
  document.getElementById("nooky-button").addEventListener("click", sendNookyMessage);
  document.getElementById("notification-button").addEventListener("click", enableNotifications);
  document.getElementById("cancel-edit-button").addEventListener("click", resetBookingForm);
  document.getElementById("book-first-button").addEventListener("click", () =>
    bookingForm.scrollIntoView({ behavior: "smooth", block: "start" })
  );
  document.getElementById("edit-next-button").addEventListener("click", event =>
    editDateNight(event.currentTarget.dataset.id)
  );
  document.getElementById("delete-next-button").addEventListener("click", event =>
    deleteDateNight(event.currentTarget.dataset.id)
  );
  document.getElementById("show-code-button").addEventListener("click", () => codeDialog.showModal());
  document.getElementById("copy-code-button").addEventListener("click", async () => {
    await navigator.clipboard.writeText(state.couple?.inviteCode || state.coupleCode);
    showToast("Couple code copied");
  });
  settingsButton.addEventListener("click", () => settingsDialog.showModal());
  document.getElementById("save-settings-button").addEventListener("click", saveSettings);
  document.getElementById("leave-space-button").addEventListener("click", leaveSpace);
  document.querySelectorAll("[data-close-dialog]").forEach(button =>
    button.addEventListener("click", () => button.closest("dialog").close())
  );
  document.querySelectorAll("dialog").forEach(dialog =>
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    })
  );

  document.getElementById("couple-code-input").addEventListener("input", event => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });

  window.addEventListener("online", () => {
    document.getElementById("connection-label").textContent =
      state.couple?.members?.length > 1 ? `Connected with ${partnerName()}` : "Connected";
  });
  window.addEventListener("offline", () => {
    document.getElementById("connection-label").textContent = "Offline · showing saved plans";
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    state.installPrompt = event;
    document.getElementById("install-card").hidden = false;
  });
  document.getElementById("install-button").addEventListener("click", async () => {
    if (!state.installPrompt) return;
    await state.installPrompt.prompt();
    state.installPrompt = null;
    document.getElementById("install-card").hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    document.getElementById("install-card").hidden = true;
    showToast("DateNight installed ♡");
  });
}

let firebaseApp;
let auth;
let db;

async function start() {
  wireInterface();
  state.serviceWorkerRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

  if (!isConfigured()) {
    configurationPanel.hidden = false;
    return;
  }

  firebaseApp = initializeApp(config.firebaseConfig);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);

  onAuthStateChanged(auth, async user => {
    if (!user) return;
    state.user = user;
    if (state.coupleId) await enterCouple();
    else showJoinPanel();
  });

  await signInAnonymously(auth);

  if (await isSupported()) {
    state.messaging = getMessaging(firebaseApp);
    onMessage(state.messaging, payload => {
      showToast(payload.notification?.body || payload.data?.body || "A message from your partner ♡");
    });
  }
}

start().catch(error => {
  console.error(error);
  configurationPanel.hidden = false;
  configurationPanel.querySelector("p").textContent =
    "DateNight could not connect. Check the Firebase setup and try again.";
});
