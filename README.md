# DateNight

DateNight is a private, installable web app for two people. It lets both partners:

- pair their phones with one private couple code;
- book a date night and choose an A–Z theme;
- plan dinner, an activity, and a private bedroom idea;
- see changes on both phones in real time;
- receive “Looking forward to our date tonight x” at 10:00 SAST on the day;
- send the other partner a “Nooky tonight?” push notification;
- review date history and the average number of days between dates.

The phone app is in `public/`. Firebase provides anonymous sign-in, Firestore
sync, and Firebase Cloud Messaging. Netlify hosts the app and runs the secure
notification functions.

Complete [SETUP.md](./SETUP.md) before deploying.
