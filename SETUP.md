# DateNight setup

DateNight needs one Firebase project and one Netlify site. Allow about 20 minutes
for the first setup.

## 1. Create the Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/), choose
   **Add project**, and name it `DateNight`.
2. In **Project overview**, choose **Add app → Web**.
3. Give the web app a nickname such as `DateNight Web`. Firebase will show a
   `firebaseConfig` object. Keep that page open.
4. Open `public/firebase-config.js` and replace every `PASTE_...` placeholder
   with the matching values from Firebase.

Firebase web configuration values are public identifiers. Do not put a service
account or private key in this file.

## 2. Enable private anonymous membership

1. In Firebase, open **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Anonymous**.
3. After the Netlify site has an address, return to **Authentication →
   Settings → Authorized domains** and add only its hostname, for example
   `datenight-for-us.netlify.app`.

Each phone receives a private Firebase identity. The first phone creates the
couple space; the second joins with the generated code.

## 3. Create Firestore and publish its rules

1. Open **Build → Firestore Database → Create database**.
2. Choose **Production mode** and the closest suitable location.
3. Open Firestore’s **Rules** tab.
4. Replace the editor contents with everything in `firestore.rules`.
5. Choose **Publish**.

The rules limit plans, device tokens, and messages to the two Firebase users in
the paired couple space.

## 4. Enable web push notifications

1. Open **Project settings → Cloud Messaging**.
2. Under **Web Push certificates**, choose **Generate key pair**.
3. Copy the public key.
4. In `public/firebase-config.js`, replace `PASTE_PUBLIC_VAPID_KEY` with that
   public key.

## 5. Give Netlify secure notification access

1. In Firebase **Project settings → Service accounts**, choose
   **Generate new private key** and download the JSON file.
2. Do **not** place that file inside the DateNight folder and never upload it.
3. In the DateNight project in Netlify, open **Project configuration →
   Environment variables**.
4. Add an environment variable named `FIREBASE_SERVICE_ACCOUNT_JSON`.
5. Paste the entire contents of the downloaded JSON file as its value. Mark it
   as a secret if Netlify offers that option.

The service account is used only inside Netlify’s protected functions to verify
the sender and deliver notifications.

## 6. Deploy through Netlify

This app cannot use Netlify’s simple drag-and-drop deployment because push
messages and 10:00 reminders require Netlify Functions.

Use either:

- **Git deployment:** place this DateNight folder in a private Git repository,
  import that repository in Netlify, and deploy it; or
- **Netlify CLI:** from this folder, connect it with `netlify init`, then publish
  with `netlify deploy --build --prod`.

`netlify.toml` already tells Netlify to:

- publish only the `public` folder;
- deploy the notification functions;
- run `date-reminders` every day at `08:00 UTC`, which is `10:00` in
  Johannesburg;
- serve the partner-message endpoint at `/api/nooky`.

After deploying, Netlify’s **Functions** page should show:

- `send-nooky`
- `date-reminders` with a **Scheduled** badge

## 7. Pair and install both phones

1. Open the Netlify production address in Chrome on the first phone.
2. Enter the first person’s name and choose **Create our space**.
3. Copy the private couple code.
4. Open the same address in Chrome on the second phone.
5. Enter the second person’s name and the code, then choose
   **Join my partner**.
6. On each phone, choose **Enable** in the notification card and accept Chrome’s
   permission prompt.
7. Use the app’s **Install app** card or Chrome’s menu to install DateNight.

## Test the connection

1. Book a date on one phone and confirm that it appears on the other.
2. Put the second phone’s app in the background.
3. Tap **Ask my partner** on the first phone and confirm that the second phone
   receives “Nooky tonight?”.
4. In Netlify, open **Functions → date-reminders → Run now** to verify the
   scheduled function runs. It sends a reminder only when a date is booked for
   the current Johannesburg date.

## Privacy and recovery

- Bedroom plans are stored in Firestore and protected by the supplied rules,
  but they are not end-to-end encrypted. Keep the couple code private and keep
  Firebase/Netlify accounts secured with two-factor authentication.
- The shared plans survive clearing browser data because they are in Firestore.
- Save the couple code somewhere private. A reinstalled phone can rejoin with
  the code and name.
- Never commit or upload the Firebase service-account JSON file.
