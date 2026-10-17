# Hit My Limit for Mac

A menu bar app that shows how close you are to your Claude Code and Codex usage limits, tells you when a lab
changes its limits, and lets you share your limit hits with [hitmylimit.com](https://hitmylimit.com) if you want to.

It reads the same local logs as `npx hitmylimit`, using a copy of that tool inside the app. It never reads
login or credential files, never reads browser cookies, and never contacts Anthropic or OpenAI.

## What it shows

- **Codex**: how full the 5-hour and weekly limits are, and when they reset, from the percentages Codex logs.
- **Claude Code**: tokens used in the current 5-hour window and when it resets. Claude Code doesn't log a
  percentage, so the app compares the window with the tokens you had used when you hit the limit before.
  Use of the Claude app counts toward the same limit and isn't in these logs.
- **Tokens before you hit the limit**: your hits this week next to your earlier ones. A drop with the same
  kind of work is what a quiet cut looks like.
- **Limit hits**: one bar per day for the last 30 days.
- **News**: the latest change-log entries from hitmylimit.com, with a notification when a lab changes its limits
  or gives out a free reset.
- **Providers**: pick Anthropic, OpenAI and Google in Settings. Turned-off providers are hidden and send no
  notifications.
- **Share**: sends your new limit hits to hitmylimit.com. Optional; the exact data is one click away. Afterwards
  it shows how your hit compares with others on your plan.

## Install

Download the zip from the latest `mac-v*` release, unzip, and move "Hit My Limit" to Applications.
Needs macOS 13 or later. Node.js is included in the app, so there is nothing else to install.

Until the app is signed with a Developer ID, macOS blocks the first launch. Open it once, then go to
System Settings → Privacy & Security and click Open Anyway.

## Build

```sh
mac/build.sh   # on a Mac with Xcode 15 or later; writes mac/dist/HitMyLimit-<version>.zip
```

The Mac app workflow builds it on every pull request that touches `mac/` or `cli/`, and publishes a release
for tags named `mac-v<version>`. It signs and notarizes when these repository secrets are set:

| Secret | What it is |
| --- | --- |
| `MAC_CERT_P12` | Developer ID Application certificate and key, exported as .p12, base64-encoded |
| `MAC_CERT_PASSWORD` | Password of that .p12 |
| `APPLE_ID` | Apple ID email of the developer account |
| `APPLE_TEAM_ID` | Team ID from developer.apple.com → Membership |
| `APPLE_APP_PASSWORD` | App-specific password from account.apple.com |

Not affiliated with Anthropic, OpenAI or Google. MIT license.
