/* The release triplet the page shows (Doctrine §7b). Classic script so both
   the page and any worker context can read it.
   The same triplet is written LITERALLY in sw.js's cache name on purpose:
   deriving it here would leave sw.js byte-identical between releases, and a
   service worker whose bytes never change is never updated — the cache that
   can only serve its own release (hub LESSONS §21, fauxplane 2026-08-02).
   tools/version-sync.mjs fails the build if the copies ever disagree. */
self.APP_VERSION = '1.0.0';
