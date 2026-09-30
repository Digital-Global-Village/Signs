# Offline Signature Cleaner

This is a fully offline browser app for turning a photo of a paper signature into a transparent PNG that can be inserted into Word documents or placed on PDFs.

## Use

1. Open `index.html` in a browser.
2. Choose or drag in a photo of your signature.
3. Adjust background removal, edge softness, and ink strength until only the ink remains.
4. Use **Auto crop** to trim extra paper space.
5. Click **Download transparent PNG**.

## Install on a Phone

Open the hosted HTTPS app once while online and wait for **Ready for offline use**.

- Android: choose **Install app**, or **Install app / Add to Home screen** in your browser menu.
- iPhone/iPad: open in Safari, tap **Share > Add to Home Screen**, and enable **Open as Web App** if offered.
- Other phones: use the browser's installation option if supported, or use the website directly.

After caching, the home-screen app works without internet. Browsers may clear cached files under storage pressure or when you clear website data; reopen online to restore them. This is an installable web app, not an APK or App Store package. It requires a modern browser; installation is not supported by every phone.

Use **Take photo** for camera input and **Share PNG** to send an export to another app when supported. Image formats must be supported by your browser; use JPEG or PNG if a photo cannot be opened. The app exports signature images for insertion into Word/PDF tools; it does not edit documents or create certificate-based digital signatures.

## Hosting and Development

The Pages workflow publishes from `main`. Enable GitHub Pages with **GitHub Actions** as its source. Relative paths support repository subdirectory hosting.

For local testing: `python3 -m http.server 4173 --bind 127.0.0.1`, then open `http://localhost:4173`. Phone installation requires an HTTPS host. Opening `index.html` directly still works for offline desktop processing.

Run `node --test tests/*.test.cjs`. Generate icons with `python3 tools/generate-icons.py`. Change the cache version in `sw.js` for each future release. New app versions take over when old app windows close. Photos are never stored in the service worker cache.

## Tips

- Use a dark pen on clean white paper.
- Take the photo in bright, even light.
- Keep the paper flat and avoid shadows.
- The app does not upload your photo anywhere; all processing happens locally in your browser.
