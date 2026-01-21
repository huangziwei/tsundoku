# Tsundoku 積読

> Tsundoku is the phenomenon of acquiring reading materials but letting them pile up in a home without reading them. The term is also used to refer to unread books on a bookshelf meant for reading later. [^1]
>
> 積読は、入手した書籍を読むことなく自宅で積んだままにしている状態を意味する言葉である [^2]

Save articles from your browser and export them as a single EPUB for offline reading or [listening](https://github.com/huangziwei/ptts), or not.

[^1]: https://en.wikipedia.org/wiki/Tsundoku
[^2]: https://ja.wikipedia.org/wiki/積読

## Firefox 
1. Open `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on".
3. Select `firefox/manifest.json`.

## Safari 
Safari Web Extensions must be bundled inside a macOS wrapper app. For personal use, build and run the wrapper app once, then enable the extension in Safari.

1. Convert the Firefox extension with `xcrun`
   ```bash
   xcrun safari-web-extension-converter ./firefox \
     --project-location ./safari \
     --bundle-identifier com.yourname.tsundoku \
     --app-name Tsundoku
   ```
2. Open the generated Xcode project at `safari/Tsundoku/Tsundoku.xcodeproj`.
3. Build and run the app once (Product → Run) to register the extension.
4. Enable it in Safari → Settings → Extensions.
   - If it doesn’t appear, enable Develop → “Allow Unsigned Extensions”.

## Usage
- Use the popup to save the current page into the selected queue.
- Create or rename queues from the queue selector.
- Export the active queue to an EPUB.
- Preview shows the sanitized HTML that will be included in the EPUB.

## Data
- All data is stored locally in IndexedDB.
