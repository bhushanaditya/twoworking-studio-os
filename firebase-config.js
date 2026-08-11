// Shared Firebase setup for both home.html and person.html.
// This is the "connection info" for your Studio OS database — safe to be
// in a plain file loaded by the browser (it's not a secret password, just
// an address for which project to talk to; real security comes from the
// Firestore rules set in the Firebase console, not from hiding this).
const firebaseConfig = {
  apiKey: "AIzaSyCU5jy4mYT7bxdIvTzcsdVNRc5tZ5ZKgq8",
  authDomain: "twoworking-studio-os.firebaseapp.com",
  projectId: "twoworking-studio-os",
  storageBucket: "twoworking-studio-os.firebasestorage.app",
  messagingSenderId: "1040719472186",
  appId: "1:1040719472186:web:b695e8814146e2fe757703"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Cache Firestore data on-device (IndexedDB) so that on your NEXT visit —
// or when you tap between Home and a person's page — the app can paint
// instantly from what's already stored locally, then quietly sync any
// changes in the background. Without this, every single page load waits
// on a fresh network round-trip before showing anything.
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  // Fails only if you have the site open in two tabs at once (synchronizeTabs
  // handles that) or on very old browsers — safe to ignore either way, it
  // just means this particular tab won't get the cache speed-up.
  console.warn('Offline cache not enabled:', err.code);
});
