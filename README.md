# Tsundoku 積読

> Tsundoku is the phenomenon of acquiring reading materials but letting them pile up in a home without reading them. The term is also used to refer to unread books on a bookshelf meant for reading later. [^1]
>
> 積読は、入手した書籍を読むことなく自宅で積んだままにしている状態を意味する言葉である [^2]

Save articles from your browser and export them as a single EPUB for offline reading or [listening](https://github.com/huangziwei/neb)[^3], or not.

[^1]: https://en.wikipedia.org/wiki/Tsundoku
[^2]: https://ja.wikipedia.org/wiki/積読
[^3]: From v0.1.4, you can send EPUB from Tsundoku to Neb directly within Firefox.

## Firefox 
1. Open `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on".
3. Select `firefox/manifest.json`.

## Safari
Safari Web Extensions must be bundled inside a macOS wrapper app. Xcode is required but you don’t need to open the GUI.

```bash
xcrun safari-web-extension-converter ./firefox --project-location ./safari --app-name Tsundoku --bundle-identifier com.yourname.Tsundoku --no-open --no-prompt --macos-only
xcodebuild -project safari/Tsundoku/Tsundoku.xcodeproj -scheme Tsundoku -configuration Release -derivedDataPath safari/build build
open safari/build/Build/Products/Release/Tsundoku.app
```

Then enable the extension in Safari → Settings → Extensions.

> **Note:** You must enable Develop → “Allow Unsigned Extensions” every time Safari is relaunched.

## Usage
- Use the popup to save the current page into the selected queue.
- Create or rename queues from the queue selector.
- Export the active queue to an EPUB.
- Preview shows the sanitized HTML that will be included in the EPUB.
- Use "Manage RSS" to add feeds, sync the RSS Inbox, and export unread items.

## Data
- All data is stored locally in IndexedDB.
