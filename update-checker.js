// Auto-update check — so nobody on the team has to remember to hard-refresh
// after we push a change. Every 30 seconds, this quietly asks the server
// "what's the latest version number?" (bypassing any caching, via
// cache: 'no-store') and compares it to the version this page was loaded
// with (window.APP_VERSION, set in a small inline script in each HTML
// file). If they don't match, someone pushed an update since this page was
// opened — we reload automatically so you're always looking at the
// current version without doing anything.
//
// IMPORTANT: we never reload while you're in the middle of something (a
// modal open, typing a log entry, editing the goal, etc) — that's what
// caused the bug where reloading wiped out an in-progress edit. Each page
// defines window.isSafeToAutoReload() to report whether now is a safe
// moment; if it's not, we just remember an update is waiting and keep
// checking every few seconds until it becomes safe (e.g. you close the
// modal or save what you were typing), then reload then.
//
// Whenever we ship a change: bump the number in version.json. That's the
// only step needed to make every open tab refresh itself once it's safe to.
(function () {
  const CHECK_INTERVAL_MS = 30000;
  const RETRY_WHILE_WAITING_MS = 5000;
  let updatePending = false;

  function isSafeToReloadNow() {
    // If a page hasn't defined this (shouldn't happen, but just in case),
    // default to "safe" rather than getting stuck never updating.
    return typeof window.isSafeToAutoReload !== 'function' || window.isSafeToAutoReload();
  }

  function reloadIfSafe() {
    if (updatePending && isSafeToReloadNow()) {
      window.location.reload();
    }
  }

  async function checkForUpdate() {
    try {
      const res = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.version === 'number' && data.version !== window.APP_VERSION) {
        updatePending = true;
      }
    } catch (err) {
      // Offline or a blip — just try again on the next interval.
    }
    reloadIfSafe();
  }

  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
  // Once we know an update is waiting, check more often whether it's now
  // safe to apply it, instead of making you wait up to 30s after you
  // finish typing/close the modal.
  setInterval(reloadIfSafe, RETRY_WHILE_WAITING_MS);
})();
