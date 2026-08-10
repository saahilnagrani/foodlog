# foodlog — how to update this app

This repo is a static **GitHub Pages** food-tracking app. Pushing to `main`
redeploys the live site (`https://saahilnagrani.github.io/foodlog/`). An Android
WebView wrapper loads that same URL and adds a `window.HealthBridge` so the
"Sync to Google Health" buttons work on the phone.

**The whole app is self-contained and runs without any AI at runtime.** The only
thing that needs Claude is the part below: turning a **meal photo** into
calorie/macro numbers and writing them into `data.json`. That is the routine job.

## Files
- `index.html` — the entire app (renders from `data.json`, fetched at load with
  cache-busting). Don't rewrite it to do a meal update; it reads the data, it
  isn't the data.
- `data.json` — **the source of truth for the food log.** This is what you edit.
- `images/` — meal photos, referenced by URL from `data.json`.
- `README.md` — placeholder, ignore.

## `data.json` shape
```jsonc
{
  "targets": { "kcal": 1900, "protein": 150, "fat": 60, "sat": 15, "carb": 180 },
  "updated": "2026-08-04",              // set to today's date on every edit
  "days": [
    {
      "date": "2026-08-04",             // YYYY-MM-DD, one object per waking day
      "label": "Tue 4 Aug",             // "<Dow> <D> <Mon>"
      "workout": "Push",                // free text, may be "" or "Rest (...)"
      "items": [
        {
          "meal": "Breakfast",          // Early morning | Breakfast | Snack | Lunch | Drink | Dinner
          "t": "08:30",                 // 24h "HH:MM", or "" if unknown.
                                        // hours >=24 mean after midnight, SAME waking day
                                        // (e.g. "25:00" = 1am). Keep late-night items on the
                                        // day they belong to, don't start a new day at midnight.
          "name": "Clear whey 30g in water",
          "kcal": 367, "protein": 29, "fat": 15, "sat": 2.5, "carb": 32,
          "img": "https://raw.githubusercontent.com/saahilnagrani/foodlog/main/images/thu30_breakfast.jpg"
        }
      ]
    }
  ]
}
```
Notes:
- `img` is **optional**. When present it is the full `raw.githubusercontent.com`
  URL to a file in `images/` (not a relative path, not a data URI).
- Keep `days` sorted oldest → newest.
- `sat` (saturated fat) is a subset of `fat`; the app draws attention when a
  day's `sat` exceeds the target (15g).

## Routine: "here's a photo of what I ate" → update the app
1. **Estimate macros from the photo(s).** For each dish give `kcal`, `protein`,
   `fat`, `sat`, `carb`. Use portion cues in the image and the user's known
   staples (whey shakes, chicken curry, eggs, etc.). If unsure, estimate and say
   so in the reply — the user often sends a correction ("correct eggs to 2 whole").
3. **Save the photo** (if the user wants it kept) into `images/` using the naming
   pattern `<dow><daynum>_<shortlabel>.jpg`, e.g. `tue4_shawarma.jpg`,
   `sat1_eggs.jpg`. Reference it via the full raw URL in the item's `img`.
   **Auto-enhance every photo before saving** (user preference): auto-orient via
   EXIF, lift exposure only when the shot is dark, correct white balance, and add
   gentle contrast/saturation/sharpening — natural, not over-processed. Downscale
   to ~1200px long edge, JPEG quality ~85, target < ~320KB. Pillow pipeline:
   ```python
   from PIL import Image, ImageOps, ImageEnhance, ImageStat
   im = ImageOps.exif_transpose(Image.open(p)).convert('RGB')
   lum = ImageStat.Stat(im.convert('L')).mean[0]
   if lum < 115:
       im = ImageEnhance.Brightness(im).enhance(min(1.9, 118/max(lum,1)))
   im = ImageOps.autocontrast(im, cutoff=(0.4, 0.2))   # white balance + levels
   im = ImageEnhance.Color(im).enhance(1.08)
   im = ImageEnhance.Contrast(im).enhance(1.04)
   im = ImageEnhance.Sharpness(im).enhance(1.15)
   ```
4. **Edit `data.json`**: add the item(s) to the right `date` (create the day
   object if it's a new day), keep items roughly in time order, and bump
   `"updated"` to today.
   **Set each item's `t` from the photo's EXIF `DateTimeOriginal`** (the phone's
   local capture time) as `HH:MM` — do NOT ask the user for the time. For an item
   with no photo (e.g. a shake): use a time the user states; else reuse the
   nearest photographed sibling's time in the same meal; else use the container
   UTC clock converted to the user's local time — **Abu Dhabi, UTC+4** (`date -u`
   plus 4 hours). Never write the raw UTC clock as the local time. Read EXIF with
   Pillow:
   ```python
   from PIL import Image
   t = Image.open(p).getexif().get_ifd(0x8769).get(36867)  # "2026:08:10 14:21:30"
   hhmm = t[11:16]  # -> "14:21"
   ```
5. **Commit + push to `main`.** Commit message style matches the existing log:
   `"<Dow> <D> <Mon>: <what changed>"`, e.g. `Tue 4 Aug: chicken shawarma platter`.
   Corrections are their own commits, same style. Pushing to `main` is what makes
   the live site (and the phone app) update.

## What does NOT need Claude
- Viewing the log, weekly charts, macros: pure static site.
- Adding a food by hand: the app's **+ Add food** button (manual macro entry,
  stored per-device in `localStorage`, not committed here).
- **Sync to Google Health**: handled on-device by the Android wrapper's
  `HealthBridge`. In a plain desktop browser the button just shows a toast.
