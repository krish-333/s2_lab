# S2 Lab v1

Browser workbench for the S2 Max glasses: Bluetooth explorer, raw command console with presets, and a Photo lab that asks Gemini about pictures from the glasses.

## Deploy (Vercel)
1. Push this folder to GitHub, import it in Vercel (framework: Vite, auto-detected).
2. Settings > Environment Variables: `GEMINI_API_KEY` (required; free key from Google AI Studio), `APP_PASSWORD` (recommended, stops strangers using your key).
3. Redeploy, then open the HTTPS URL in **Chrome for Android** (not an in-app browser).

## Morning test plan
1. Force-stop RDGlass. Turn the glasses on. Tap Connect glasses and pick them.
2. Bluetooth explorer: tick Deep scan, then Connect. The app auto-reads and auto-listens to everything it finds. If nothing shows, use Sniff advertised UUIDs, add them, reconnect. Then tap Copy report and share it for decoding. Old notes follow:
   Note the services found. If none, install nRF Connect, scan the glasses, copy the service UUIDs into "Extra service UUIDs", reconnect.
3. Tap Listen on every notify characteristic, then press the glasses' button or take a photo with the glasses. Watch the Console log for bytes. Save the log and share it.
4. Photo lab: import a photo with RDGlass first, pick it in Camera, tap Ask Gemini.

## Going deeper
Turn on Developer options > "Enable Bluetooth HCI snoop log", use RDGlass (connect, take a photo, import), then pull the log from a bug report and open it in Wireshark. That shows the exact bytes RDGlass sends.

## Limits
- Web Bluetooth = BLE only (no audio profiles), Chrome/Chromium, HTTPS, needs a tap to connect. Not on iPhone.
- A web page cannot switch the phone's Wi-Fi, and HTTPS pages cannot call a plain-http glasses server, so Wi-Fi media transfer likely needs a native Android app later.
- Never write to firmware/OTA or reset characteristics.
- Record only where lawful and with consent.
