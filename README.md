# LinkedIn Job Keyword Filter (Firefox)

This Firefox extension hides LinkedIn job cards when their text contains any blocked keyword.

## What It Filters

The content script scans job cards that match:

- `li[data-occludable-job-id]`

If a card text contains one of your keywords (case-insensitive), the full card element is removed.

## Install (Temporary Add-on in Firefox / Zen Browser)

1. Open your browser and go to `about:debugging`.
2. Click **This Firefox** (or **This Browser** on Zen, depending on build).
3. Click **Load Temporary Add-on...**.
4. Select the `manifest.json` file from this folder.

## Use

1. Open LinkedIn Jobs (`https://www.linkedin.com/jobs/`).
2. Click the extension icon.
3. Add keywords like `senior`, `onsite`, `java`, `intern`.
4. Matching jobs are removed automatically.

## Notes

- Keywords are saved in `storage.local`.
- Filtering runs on page updates too (LinkedIn loads jobs dynamically).
- To reset, remove keywords from the popup.
