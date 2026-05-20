# monitor-footjoy

A small Node.js scraper that watches the [FootJoy UK shoe fitting events page](https://footjoyukshoefittingevents.as.me/schedule/aa876a03) and opens a GitHub issue whenever new events are added.

It runs on a schedule via GitHub Actions, keeps a JSON snapshot of the last-seen events in the repo, and only alerts on additions after the initial baseline run.

## How it works

[scripts/monitor-footjoy.mjs](scripts/monitor-footjoy.mjs):

1. Fetches the FootJoy schedule page.
2. Strips HTML and extracts event lines matching the pattern `Month Day(st/nd/rd/th) - Venue - UK Postcode` (e.g. `June 10th - Kilnwick Percy Golf Club - YO42 1UF`).
3. Compares the extracted list against the previous snapshot at `.monitor/footjoy-events.json`.
4. Writes the refreshed snapshot back to disk and emits GitHub Actions outputs (`changed`, `new_count`, `subject`, `new_events`).

The [Monitor FootJoy Events workflow](.github/workflows/monitor-footjoy.yml) runs the script daily, commits any changes to the snapshot file, and opens an issue listing the new events when `changed == 'true'`. Each issue is:

- labelled `footjoy-event` so you can filter notifications in your inbox, and
- assigned to the repo owner so GitHub always sends an email (no SMTP server needed).

Create the `footjoy-event` label once in **Issues → Labels** if you want it to have a custom colour; otherwise it will be auto-created the first time an issue is opened.

Event outputs are passed into the issue-creation step via environment variables rather than templated into the inline JavaScript, so unusual characters in venue names cannot break or inject into the script.

## Requirements

- Node.js 20 or newer (uses built-in `fetch` and `node:fs/promises`).
- No npm dependencies.

A [dev container](.devcontainer/devcontainer.json) is included if you want a ready-to-go environment in VS Code or GitHub Codespaces.

## Running locally

```bash
node scripts/monitor-footjoy.mjs
```

On the first run the snapshot is created and no alert is emitted (the baseline is just being established). Subsequent runs report only newly added events.

To reset the baseline, delete `.monitor/footjoy-events.json` and run the script again.

## Repository layout

```
.devcontainer/        Dev container definition
.github/workflows/    Scheduled GitHub Actions workflow
.monitor/             Persisted event snapshot (created on first run)
scripts/              The monitor script
```

## License

[MIT](LICENSE)
