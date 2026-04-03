# LinkedIn Job Keyword Filter (Firefox)

This Firefox extension hides LinkedIn job cards when their text contains any blocked keyword.

It can also reveal LinkedIn gated (blurred) cards in the list view with a gray background for easy visual distinction.

## What It Filters

The content script scans job cards that match:

- `li[data-occludable-job-id]`
- `li.discovery-templates-entity-item`
- `li.scaffold-layout__list-item` (when it contains a standard `.job-card-container`)

It can hide cards when any of these conditions are enabled:

- Keyword match in title, company, or location (case-sensitive, whole-word matching)
- Status contains Viewed / Visto (when Hide viewed jobs is enabled)
- Status contains Applied / Solicitados (when Hide applied jobs is enabled)

Hidden cards are removed from the list with `display: none`.

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
5. Optionally enable **Unblur gated cards** to reveal text from blurred placeholders while keeping those rows visibly gray.

## Notes

- Keywords are saved in `storage.local`.
- Filtering runs on page updates too (LinkedIn loads jobs dynamically).
- To reset, remove keywords from the popup.
