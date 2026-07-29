# Substack Swipe Deck

A one-page React site that turns a Google Sheet of Substack finds into a swipeable reading game.

## What it does

- Loads articles from a Google Sheet tab
- Sorts the newest discovery dates first
- Shows one article card at a time
- Swipe right: `Read`
- Swipe up: `Read Later`
- Swipe left: `Not Interested`
- Swipe down: undo the previous decision
- Click a card to open the full summary and article link
- Starts with a hero section, then shifts into a locked swipe arena with a Home button
- Shows analytics with status counts, a heatmap, and a latest-stack chart

## Local development

```bash
npm install
npm run dev
```

## Environment variables

Create a `.env` file from `.env.example` and fill in:

```bash
VITE_SUBSTACK_SHEET_ID=your_google_sheet_id
VITE_SUBSTACK_SHEET_GID=0
VITE_SUBSTACK_API_URL=your_google_apps_script_web_app_url
```

- `VITE_SUBSTACK_SHEET_ID` is required.
- `VITE_SUBSTACK_SHEET_GID` is optional and defaults to `0`.
- `VITE_SUBSTACK_API_URL` is optional. Without it, swipe decisions stay in the browser only.

## Google Sheet setup

Keep the sheet shared as **Anyone with the link -> Viewer** so the static site can read it.

Expected columns:

1. `S.no`
2. `Discovery Date`
3. `Article Title`
4. `Author`
5. `Published`
6. `Article Link`
7. `Tags`
8. `Summary`
9. `Status`

## Google Apps Script setup

1. Open Apps Script.
2. Create a new script project.
3. Paste the contents of [google-apps-script/Code.gs](./google-apps-script/Code.gs).
4. In Apps Script, open `Project Settings` and add these script properties:
   - `SUBSTACK_SPREADSHEET_ID`
   - `SUBSTACK_SHEET_NAME`
   - `SUBSTACK_STATUS_HEADER` (optional, defaults to `Status`)
5. Deploy it as a **Web app**.
6. Set access to **Anyone** or **Anyone with the link**.
7. Copy the deployed Web app URL.
8. Add it to Render as `VITE_SUBSTACK_API_URL`.

If you leave `SUBSTACK_SHEET_NAME` empty, the script uses the first sheet tab.

## Render deployment

The included [render.yaml](./render.yaml) defines a Render static site:

- Build command: `npm ci && npm run build`
- Publish directory: `dist`

Connect the repo in Render and create the service from the blueprint.
