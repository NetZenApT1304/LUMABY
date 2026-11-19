# Lumaby on Google Play and the App Store

Status and checklist for getting Lumaby into the stores. The web app
(lumabyy.netlify.app) stays the single source: the store apps open it.

## Done (in the Dec 15 bundle)
- [x] **Delete my account** in the app (My Account → Delete account), and a
      public page explaining it: `privacy.html#delete-account` (Google asks
      for this link). Database function: `supabase/migrations/005_account_deletion.sql`
      (already applied). Test: `tests/e2e/deleteaccount.js`.
- [x] **Sign in with Apple** button: appears by itself once Apple is turned
      on in Supabase (Authentication → Providers → Apple). Apple requires it
      because we offer Google sign-in.
- [x] Store icons: `icons/icon-512.png` (Google Play), `icons/store-icon-1024.png` (App Store).
- [x] Maskable Android icons and manifest set up for the Android wrapper.
- [x] **Android app built** (`android/`, see android/README.md): package
      `com.lumaby.app`, version 1.0.0 (code 1), targets Android 16 (API 36).
      Signed with the upload key; `.aab` for Play and `.apk` for testing.
      `/.well-known/assetlinks.json` added (upload key fingerprint).
- [x] Screenshots: `node tools/store-screenshots.js <folder>` makes
      Google Play (1080×1920) and App Store (1290×2796) sets from a demo baby.

## Owner to-do
1. **Google Play developer account:** play.google.com/console, $25 one-time,
   ID verification (a few days).
2. **Apple Developer Program:** developer.apple.com, $99/year. Needed for
   the App Store and for Sign in with Apple.
3. **Google Play billing setup** (see "Google Play billing" below).
4. **Keep the upload key safe:** `lumaby-upload.jks` + `lumaby-upload-key.txt`
   (password). Not in the repo. Password manager + a backup.
5. **Find 12 Android testers** for the 14-day closed test (new personal
   Play accounts must do this before going public).

## Android (Google Play): steps
1. ~~Build the app~~ done: `android/app/build/outputs/bundle/release/app-release.aab`.
2. ~~Upload key~~ done; keep it safe.
3. ~~assetlinks.json~~ done for the upload key. After the first upload, add
   Google's app-signing key fingerprint (Play Console → App integrity →
   App signing) and deploy. Without it the app shows a browser address bar.
4. Play Console: create the app, fill in the store listing (below), Data
   safety (below), content rating, target audience **18+**, category
   **Parenting**, privacy policy `https://lumabyy.netlify.app/privacy.html`,
   account deletion URL `https://lumabyy.netlify.app/privacy.html#delete-account`.
5. Upload the .aab to closed testing, 12+ testers for 14 days, then apply
   for production.

## iPhone (App Store): steps
1. Capacitor wrapper (native shell around the web app) with native push
   notifications through Apple (APNs), because web push doesn't work inside
   iPhone apps. The reminders server (`send-reminders.js`) gets an APNs
   sender next to Web Push.
2. Turn on Sign in with Apple: Apple Developer → Identifiers (Services ID
   + key) → Supabase → Providers → Apple.
3. Build and upload with Xcode on a Mac, or a cloud build service.
4. App Store Connect: listing, screenshots, privacy labels (below), age
   rating, a demo account for the reviewer.

## Google Play billing (built; needs setup in Play Console)
Inside the Android app, Premium is sold through Google Play; the website
keeps Lemon Squeezy. One Premium status either way. Code: `js/billing.js`
(app), `netlify/functions/play-verify.js` + `play-refresh.js` (server checks
every purchase with Google, daily renewal check), `netlify/lib/play.js`,
`supabase/migrations/006_play_billing.sql` (applied). Tests:
`tests/unit/play.test.js`, `tests/e2e/billing.js`.

**Owner setup, once the developer account is verified** (needs the first
.aab uploaded to a test track before products can be created):
1. Play Console → Lumaby → Monetize → Subscriptions → create two
   subscriptions with these exact product IDs:
   - `premium_monthly`: one base plan, monthly, auto-renewing, $4.99
     (Play sets other countries' prices). Add an offer: **7-day free trial**,
     new customers only. Mark the base plan **backwards compatible**.
   - `premium_yearly`: one base plan, yearly, auto-renewing, $35.99.
     Backwards compatible. (Trial optional.)
2. Google Cloud console (console.cloud.google.com): create a project →
   enable **Google Play Android Developer API** → IAM → Service accounts →
   create one → Keys → Add key → JSON (downloads a file; keep it private).
3. Play Console → Users and permissions → Invite new users → the service
   account's email → app: Lumaby → permissions: **View financial data**
   and **Manage orders and subscriptions**.
4. Netlify → Site configuration → Environment variables → add
   `GOOGLE_PLAY_SERVICE_ACCOUNT` = the whole JSON file contents. (Or upload
   the file to a Claude session and Claude sets it through the Netlify API.
   Don't paste the key into chat.)
5. Play Console → Setup → License testing → add your testers' Gmail
   addresses so test purchases aren't charged.

## Payments (decision)
**Chosen: A** (store billing in the Play app, Lemon Squeezy on the web).
Apple still to do when the iPhone app is built.


Both stores generally require their own in-app purchase system for digital
subscriptions bought inside the app (15% fee for small developers). Lemon
Squeezy checkout inside the store apps can get them rejected. The US has
court-ordered exceptions allowing a link to outside checkout; check the
current Apple and Google rules right before submitting. Options:
- **A.** Store billing in the store apps, Lemon Squeezy on the web, one
  Premium status (most work, safest).
- **B.** No purchase buttons in the store apps; people subscribe on the web
  and sign in (allowed in some cases, riskier).
- **C.** Launch the store apps free-only first, add store billing later.

---

## Store listing (draft)
**App name:** Lumaby: Baby Care Companion  (30 chars max on both stores)

**Short description** (Google Play, 80 max):
A calm companion for feeds, sleep, diapers, growth and your baby's firsts.

**Subtitle** (App Store, 30 max): Feeds, sleep & baby's firsts

**Full description:**
Lumaby is a calm, beautiful companion for your baby's first years. Log a
feed or a diaper in a tap, see how sleep is going, and keep every first
in one place, together with your partner.

ONE-TAP LOGGING
• Nursing timer with Left and Right sides, and it remembers which side is next
• Bottles, pumping, diapers, sleep, solids, teething, baths, medicine, temperature
• Shortcuts from your home screen: repeat the last feed, log a diaper, start a nap

GENTLE REMINDERS
• Feed reminders that learn your baby's rhythm
• Nap windows, medicine times, bath days and growth checks
• Doctor appointments, highlighted pink on your calendar, with a reminder before

SEE THE PATTERNS
• Weekly sleep and feeding charts
• WHO growth percentiles for weight and height
• A pediatrician report you can download as a PDF

SHARE THE LOAD
• Invite your partner to log for the same baby, on their own phone
• Everything syncs between your devices

KEEP THE MEMORIES
• Milestones and firsts, month by month
• A baby book you can download and print

MADE FOR TIRED EYES
• Night mode with a warm, low-blue-light screen
• Works offline; syncs when you're back online
• Accessible: screen readers, keyboard, large text

Premium unlocks sync, partner sharing, reminders, reports and the baby book.
Lumaby is not a medical device. Always talk to your doctor about your baby's
health.

**Keywords** (App Store, 100 max):
baby,newborn,feeding,breastfeeding,nursing,sleep,diaper,growth,milestones,parenting

**Category:** Parenting (Google Play) / Health & Fitness, secondary Lifestyle (App Store)

## Google Play Data safety (draft answers)
- Data collected: **Email address** (account), **Name** (optional, your
  own first name), **Other user-generated content** (baby logs, notes,
  growth), **Health info** (temperature, medicine, doctor visits you enter),
  **App info: device push token** (reminders), **Purchase history**
  (subscription status from Lemon Squeezy).
- Shared with third parties: **No** (Supabase and Lemon Squeezy are
  service providers processing data on our behalf).
- Encrypted in transit: **Yes**. Users can request deletion: **Yes** (in
  app and via the privacy page).
- Data used for: App functionality, Account management. Not used for ads
  or analytics.

## App Store privacy labels (draft)
- Data linked to you: Contact info (email), Health & fitness (entries you
  make), User content, Identifiers (user ID), Purchases.
- Data used to track you: **None**.

## App Review notes (draft)
"Lumaby is a baby care log for parents. Demo account: (create one) /
(password). Premium features are enabled on this account. Notifications are
reminders the parent sets up. Account deletion: My Account → Delete account."
