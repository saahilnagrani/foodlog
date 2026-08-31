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
- `tools/fmt_data.py` — the one definition of `data.json`'s on-disk format.
- `README.md` — placeholder, ignore.

## Always write `data.json` through `tools/fmt_data.py`
`data.json` has **two** writers: this session (Python) and the app itself (the
"+ Add food" sheet pushes via the GitHub Contents API using
`JSON.stringify(data, null, 2)`). If the two disagree on formatting, every app
commit rewrites the whole file and the diff becomes unreadable. So never call
`json.dump` directly — use:

```python
import sys; sys.path.insert(0, 'tools')
from fmt_data import load, save
d = load(); ...; save(d)
```

which matches `JSON.stringify` exactly: 2-space indent, whole numbers as ints
(`20.0` → `20`), raw UTF-8 (not `\uXXXX`), no trailing newline. Running
`python3 tools/fmt_data.py` normalises the file in place.

## `data.json` shape
```jsonc
{
  "targets": { "kcal": 1900, "protein": 150, "fat": 60, "sat": 15, "carb": 180, "fibre": 30 },
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
          "fibre": 1,                  // optional; ABSENT means unknown, not zero
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
- `fibre` is **optional and must stay optional**. Items logged before fibre
  tracking existed have no `fibre` key, and `totals()` counts a day's missing
  items so every screen prints `13+` rather than a confident `13`. Never write
  `"fibre": 0` to mean "I didn't work it out" - omit the key. Do write a real
  `0` for foods that genuinely have none (whey, eggs, meat, fish, oil).
  **Set `fibre` on every item you add from now on.** Constipation on a
  high-protein cut is the reason it is tracked: the log was averaging ~15g
  against a 30g target because whey shakes displaced dal, sprouts and roti.

## Known tare weights
The user often weighs food **in** its container and gives the gross weight. Subtract:

| container | empty weight |
|---|---|
| square glass container (the one in the moong-sprout photos) | **330 g** |
| deep steel bowl (egg curry, 10 Aug) | 353 g |
| large salad bowl (watermelon & feta, 19 Aug) | 833 g |

If a gross weight arrives for a container that isn't listed, estimate it but say so,
and ask for the empty weight — the container is usually most of the gross figure, so
guessing it badly swamps the food estimate.

## Routine: "here's a photo of what I ate" → update the app
1. **Estimate macros from the photo(s).** For each dish give `kcal`, `protein`,
   `fat`, `sat`, `carb` and `fibre`. Use portion cues in the image and the user's known
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
   plus 4 hours). Never write the raw UTC clock as the local time. If that local
   time is past midnight but the meal continues the same waking day (a late-night
   snack after that evening's dinner), write it as 24+ (`00:45` → `24:45`) so it
   sorts after the evening, not at the top of the day. Read EXIF with Pillow:
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
- Adding a food: the app's **+ Add food** button picks from a fixed list of ~32
  quick-add foods, each with per-gram rates including fibre. The free-text
  manual-entry form was removed, so anything not on that list has to come
  through here. Quick adds are stored per-device in `localStorage` until the
  user taps "Save items to data.json". The list can be sorted A-Z or by
  most-used, and each food shows how often it appears in the log.
- Deleting a food: swipe a row left in the app and tap Delete. If the item was
  still local it just disappears; if it was already in `data.json` the app
  commits the removal itself (`App: delete "..." from <date>`), so pull before
  your next edit.
- Editing a food: swipe left, tap Edit. The sheet edits every field **including
  the day**, so moving an item between waking days is a phone job, not a Claude
  job. A day change commits as `App: move "..." from <date> to <date>` and the
  old day object is kept even if it empties, because it holds `workout`.
  Entering a 24+ time whose clock moment is still in the future is the classic
  late-night slip (typing `24:05` next morning with the day left on Today), so
  the app warns and offers the previous day before saving.
- **Sync to Google Health**: handled on-device by the Android wrapper's
  `HealthBridge`. In a plain desktop browser the button just shows a toast.

## Google Health sync — what the wrapper actually does
Decompiled from the installed APK (`MainActivity.writeDayItems`). The wrapper
cannot be rebuilt here, so `index.html` works around it:

- `syncDayItems(date, itemsJson)` **deletes every `NutritionRecord` inside that
  calendar date and then inserts** what you passed. So a payload must always be
  the *complete* day — never a fragment, or you silently wipe the rest.
- It **ignores each item's `t`.** Times come from the `meal` string only:
  breakfast → 08:30, lunch → 13:00, dinner → 20:00, anything else → 16:30.
  That is why the app aggregates a day into at most three records
  (`syncBucket` / `syncPayload`) — per-item records would collide and be lost.
- `clientRecordId` is `foodlog-<date>-<index>`, so records are keyed by position
  in the array you send.

Because Health totals by **calendar** date and the log is kept by **waking**
day, `syncDay(date)` writes calendar date `date` (= that date's pre-midnight
items **plus** the previous night's 24+ tail, via `calDayItems`), and also
writes `date+1` when that night ran past midnight. Settings → **Day boundary**
switches the whole app between waking-day and calendar-day grouping; calendar
grouping is display-only (`toCalDays`) and matches Health exactly, so the two
can be compared number for number. `data.json` is always stored by waking day.
