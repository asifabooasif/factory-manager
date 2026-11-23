# Item photos (article photo upload)

- js/modules/items.js — Photo field on the item form (camera or file), thumbnail beside the code in the Items list (click to enlarge), "Remove photo". Photos are resized in the browser to max 420 px JPEG (about 20-65 KB) and stored on the item, so they sync like the rest of the data.
- js/core/audit.js — audit log records "[photo]" instead of the picture data, so history stays small and readable.

Copy both files over the same paths in your project.
