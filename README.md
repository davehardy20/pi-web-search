# @davehardy20/pi-web-search

Pi package for web search via Tavily API.

## What it adds

- `web_search` tool — Search the web using Tavily API. Returns relevant results with summaries and source URLs.
- `/web-search-status` — Show package name, version, source path, API key status,
  and search readiness.

## Prerequisites

- A [Tavily](https://tavily.com) API key set as the `TAVILY_API_KEY` environment variable.

```bash
export TAVILY_API_KEY='your-key'
```

## Install

From npm:

```bash
pi install npm:@davehardy20/pi-web-search
```

From git:

```bash
pi install git:github.com/davehardy20/pi-web-search
```

From a local checkout during development:

```bash
pi install /Users/dave/tools/pi-web-search
```

For one run only:

```bash
pi -e /Users/dave/tools/pi-web-search
```

## Notes

- Requires `TAVILY_API_KEY` to be set in the environment. The tool returns a clear error if the key is missing.
- If the `web_search` tool appears twice, Pi is probably loading both this package
  and the old local `agent/extensions/web-search.ts` file.
- Disable or remove the old local auto-discovered extension before reload verification.

## Update flow

1. update the package repo
2. push to GitHub
3. run `pi update --extensions` or reinstall the package
4. run `/reload`

`/reload` alone does not fetch newer package commits.

## Troubleshooting

Run `/web-search-status` to confirm:

- package name
- package version
- loaded source path
- Tavily API key status (set/not set)
- search readiness (ready/not ready)

## Build and test

```bash
npm run typecheck
npm run test
npm run build
```
