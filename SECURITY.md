# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.
Use [GitHub's private vulnerability reporting](https://github.com/huyz0/ztui/security/advisories/new)
for this repository, or contact the maintainer directly. You can expect an
initial response within a few days.

## Scope notes

A few things are security-relevant by design:

- **The REST inspector** (`startInspector`) has **no authentication** and
  `POST /input` can drive the app. It binds to `127.0.0.1` by default — only
  expose it to a network you trust, and never to the public internet.
- **On-screen text read by an AI agent is untrusted input.** Content your app
  renders (Markdown, chat messages, API responses) can carry prompt-injection
  payloads. ztui hardens the rendering boundary (control-character stripping,
  HTML escaping, link scheme-checks), but the *meaning* of displayed text is the
  application's responsibility to treat with suspicion. See the
  [Debugging & AI agents guide](https://huyz0.github.io/ztui/guides/debugging/).
