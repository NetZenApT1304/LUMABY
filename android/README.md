# Lumaby for Android (Google Play)

A Trusted Web Activity: the app opens https://lumabyy.netlify.app/
full-screen in the phone's Chrome. App changes ship with the website; a new
Play upload is only needed for a new icon, name, Android version
requirement, or Play policy change.

- Package id: `com.lumaby.app` (permanent once uploaded)
- Library: `com.google.androidbrowserhelper` (Google's TWA helper)
- Icons: generated from `../icons` and `../brand` (adaptive icon = the
  maskable icon; notification icon = the one-colour badge)
- Long-press shortcuts: Repeat last feed, Wet diaper, Dirty diaper, Start
  sleep timer (same as the web app)
- Reminders (web push) show as Lumaby notifications (DelegationService)
- Google Play billing: `com.google.androidbrowserhelper:billing` gives the
  web app Google Play as a payment method (Digital Goods API). Products
  `premium_monthly` / `premium_yearly`; see ../STORES.md.

## Build
Needs JDK 17+ and the Android SDK (platform 36). From `android/`:

    ./gradlew bundleRelease     # app/build/outputs/bundle/release/app-release.aab  (upload to Play)
    ./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk    (install on a phone to test)

Signing uses `keystore.properties` (git-ignored, see `app/build.gradle`).
**The upload key (`lumaby-upload.jks`) and its password are not in the
repo. Keep them somewhere safe (password manager + a backup).** If lost,
Google can reset the upload key through Play Console support; it's slow
but not fatal, because Google holds the real app-signing key.

Before every upload: bump `versionCode` (by 1) and `versionName` in
`app/build.gradle`.

## Website link (no address bar)
`../.well-known/assetlinks.json` lists the SHA-256 fingerprints allowed to
open the site full-screen. It has the upload key. **After the first upload,
add Google's app-signing key fingerprint** (Play Console → Test and release
→ App integrity → App signing → SHA-256) as a second entry and deploy the
site, or the Play-installed app will show a browser address bar.
Check with: https://developers.google.com/digital-asset-links/tools/generator

## Test on a phone
Install `app-release.apk` (allow "install unknown apps"). Until the Dec 15
deploy puts `assetlinks.json` live, the app opens with an address bar at
the top; that's expected.
