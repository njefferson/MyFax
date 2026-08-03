/* The ONE source of the app's patch notes (Doctrine §7d): the (i) panel
   renders this; nothing else restates it. Newest first, at most six entries —
   older history lives in the repo. Written for the reader, in their words,
   and each entry says what is STILL OPEN, not only what got fixed.
   tools/version-sync.mjs asserts the top entry matches version.js, sw.js,
   and CHANGELOG.md. `date: null` means staged, not yet released. */
self.RELEASE_NOTES = [
  {
    version: '1.0.0',
    kind: 'VERSION',
    date: null,
    notes: [
      'First release: send a PDF or photo to a US or Canadian fax number from this device.',
      'The transmission tape prints each step until the carrier confirms delivery.',
      'Offline sends wait on this device and go out by themselves when you are back online.',
      'History and settings stay in this browser; nothing is tracked.',
    ],
    known: [
      'The free carrier tier is 2 faxes a month, up to 5 pages each — including a cover page it always adds. The app cannot yet warn you before a long document hits that cap.',
      'There is no "free faxes left this month" display yet.',
      'Receiving faxes is not possible — sending only.',
      'A very slow carrier can leave a send marked "unknown"; check Activity later rather than resending, or the fax may go twice.',
    ],
  },
];
