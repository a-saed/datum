# datum-cli

Zero-install CLI for [datum](https://github.com/a-saed/datum): run a local Postgres and `datum-server` together with one command — no Go toolchain, no hand-written Docker config.

## Quick start

```bash
npx datum-cli init   # generates a starter datum.yaml
npx datum-cli dev     # runs Postgres + datum-server
```

## Commands

```
datum init                        Interactively generate a starter datum.yaml
datum dev [--db <connection-url>]  Run Postgres + datum-server
datum stop                        Tear down whatever `dev` started
datum --help                      Show usage
datum --version                   Show the installed version
```

## How Postgres is resolved

`datum dev` picks a Postgres connection in this order:

1. **Bring your own** — `--db postgres://...`, or a `DATABASE_URL` environment variable. Already have a database? This connects directly.
2. **Docker** — if neither is set, and Docker is available, `datum dev` starts a `postgis/postgis` container for you automatically.
3. **Clear error** — if neither Docker nor a connection string is available, `datum dev` exits with an explanation of how to fix that, rather than failing silently.

`Ctrl-C` stops `datum-server` and tears down anything `dev` started (the Docker container, if one was used).

## The `datum-server` binary

`datum-cli` distributes the `datum-server` Go binary via per-platform npm packages (`linux`/`darwin` × `x64`/`arm64`) installed automatically as optional dependencies — npm picks the one matching your machine. No separate download or Go toolchain required.

## Learn more

- [Docs](https://a-saed.github.io/datum)
- [Repository](https://github.com/a-saed/datum)
