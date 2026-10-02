# v1.0.1

- Added manual crop selection with Apply, Cancel, and Restore crop controls.
- Fixed repeated cropping to retain the correct original-image coordinates.
- Auto crop now follows cleanup changes and respects a manually selected region.
- Restore crop keeps ink cleanup settings intact.
- Updated offline cache version and regression checks for crop selection, cancellation, restoration, and scaled preview coordinates.

Verified with all three automated tests passing. Reopen installed app windows while online to receive the cache update. GitHub Pages hosting remains unavailable because organization administrators have disabled Pages creation; the ZIP can be hosted on another HTTPS server or opened locally on desktop.

The ZIP contains the offline desktop app and web hosting files, not a native APK or iOS package.

## v1.0.0

- Installable phone web app with home-screen icons and a standalone display.
- Offline app caching after the first online visit.
- Camera/photo input, signature cleanup, auto cropping, transparent PNG export, and file sharing where supported.
- GitHub Pages deployment workflow and installation instructions.

Install the hosted HTTPS version from your phone browser. On iPhone/iPad, use Safari's Share > Add to Home Screen. On Android, use Install app or the browser menu. Requires a modern browser; universal support for every phone is not guaranteed.

The ZIP contains the complete offline desktop app and web hosting files. It is not a native APK or iOS package.
