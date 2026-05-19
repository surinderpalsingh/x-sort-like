# X Reply Like Sort

A small Chrome extension that opens X/Twitter tweet pages with replies sorted by likes by adding:

```text
?sort_replies=likes
```

The extension includes a popup toggle for turning the behavior on or off.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project directory.

## Behavior

- Runs on `x.com` and `twitter.com`.
- Updates X's in-page history navigation before X handles routing, avoiding a forced full-page reload during normal timeline clicks.
- Forces X's tweet detail data request to use the likes reply ranking mode.
- Selects X's visible reply sort control when needed so the UI and underlying data mode match.
- Redirects direct tweet page loads at the request level so `sort_replies=likes` is present before the page renders.
