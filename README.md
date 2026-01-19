# Tsundoku

Save articles from your browser and export them as a single EPUB for TTS or offline reading.

## Status
- Firefox extension is the active build in `firefox/`.
- Safari port placeholder lives in `safari/`.

## Firefox (development load)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on".
3. Select `firefox/manifest.json`.

## Usage
- Use the popup to save the current page into the selected queue.
- Create or rename queues from the queue selector.
- Export the active queue to an EPUB.
- Preview shows the sanitized HTML that will be included in the EPUB.

## Data
- All data is stored locally in IndexedDB.
