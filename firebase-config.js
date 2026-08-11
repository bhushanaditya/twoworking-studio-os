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
