// Auto-update check — so nobody on the team has to remember to hard-refresh
// after we push a change. Every 30 seconds, this quietly asks the server
// "what's the latest version number?" (bypassing any caching, via
// cache: 'no-store') and compares it to the version this page was loaded
// with (window.APP_VERSION, set in a small inline script in each HTML
// file). If they don't match, someone pushed an update since this page was
// opened — we reload automatically so you're always looking at the
// current version without doing anything.
//
// Whenever we ship a change: bump the number in version.json. That's the
// only step needed to make every open tab refresh itself within ~30s.
(function () {
  const CHECK_INTERVAL_MS = 30000;

  async function checkForUpdate() {
    try {
      const res = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.version === 'number' && data.version !== window.APP_VERSION) {
        window.location.reload();
      }
    } catch (err) {
      // Offline or a blip — just try again on the next interval.
    }
  }

  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
})();
