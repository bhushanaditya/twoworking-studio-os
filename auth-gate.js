// Shared PIN gate for both index.html and person.html.
//
// How this actually protects data: Firestore's security rules require
// request.auth != null for everything except the one doc that holds the
// hashed PIN (config/security, readable by anyone but writable by no one
// from the app). So typing the right PIN doesn't just hide/show things on
// screen — it's what lets Firebase sign you in (anonymously) at all, and
// without that sign-in, the database itself refuses to hand over any real
// data no matter what the page's HTML/JS tries to do.
//
// window.authReady resolves once we're actually signed in — index.js and
// person.js wait on this before touching Firestore, so they don't try (and
// fail) to read data before the PIN has been entered.
window.authReady = new Promise((resolve) => {
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      document.body.classList.add('authed');
      resolve(user);
    } else {
      document.body.classList.remove('authed');
    }
  });
});

(function () {
  const pinInput = document.getElementById('pinInput');
  const pinSubmitBtn = document.getElementById('pinSubmitBtn');
  const pinError = document.getElementById('pinError');

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function trySubmitPin() {
    const entered = pinInput.value.trim();
    if (!entered) return;
    pinSubmitBtn.disabled = true;
    pinError.textContent = '';
    try {
      const configSnap = await db.collection('config').doc('security').get();
      const expectedHash = configSnap.exists ? configSnap.data().pinHash : null;
      const enteredHash = await sha256Hex(entered);
      if (expectedHash && enteredHash === expectedHash) {
        await firebase.auth().signInAnonymously();
        // window.authReady resolves via onAuthStateChanged above — that's
        // what actually reveals the app (body.authed).
      } else {
        pinError.textContent = 'Incorrect PIN — try again.';
        pinInput.value = '';
        pinInput.focus();
      }
    } catch (err) {
      pinError.textContent = 'Could not check PIN — check your connection.';
      console.error(err);
    }
    pinSubmitBtn.disabled = false;
  }

  pinSubmitBtn.addEventListener('click', trySubmitPin);
  pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') trySubmitPin(); });
})();
