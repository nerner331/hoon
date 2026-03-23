# Hoon Store Android WebView

This folder contains an Android wrapper app that opens the published Hoon Store website inside a native `WebView`.

## What is ready

- Android app module with Kotlin + Gradle
- `WebView` configured for JavaScript, cookies, DOM storage, and pull-to-refresh
- Camera permission bridge for the in-page listing camera flow
- File upload chooser for courier identity/live-photo inputs
- External handling for WhatsApp, phone, mail, and `intent://` links

## First thing to review

The app currently loads this URL by default:

```text
https://hoon-store.onrender.com/
```

If your live domain is different, update:

- `app/src/main/res/values/strings.xml`

## Build steps

1. Open `android-webview/` in Android Studio
2. Let Gradle sync
3. Confirm the live site URL in `strings.xml`
4. Build a debug APK from Android Studio

## Notes

- Production should use `HTTPS`
- The Android wrapper depends on your published website and backend staying online
- If you later want push notifications or deeper native integrations, migrating this wrapper to Capacitor is the next step
