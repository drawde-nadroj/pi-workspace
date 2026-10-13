# Contributing

Thanks for helping improve `pi-ask`.

1. Open an issue for substantial behavior or interface changes so the approach can be discussed first.
2. Fork the repository and create a focused branch.
3. For this suite checkout, install the locked dependency tree with `npm ci` from the repository root. An independent Ask checkout uses its own package installation instead.
4. From the suite root, run `npm run test:ask`, `npm run typecheck --workspace=pi-ask`, and `npm run pack:check --workspace=pi-ask`. The installed-host runner needs a compatible Pi host and resolvable Frame dependency; see [development](README.md#development).
5. Submit a pull request that explains the user-visible effect and includes focused tests for behavior changes.

Keep changes small, preserve existing keyboard behavior unless the change is intentional, and do not include credentials, private configuration, or generated package archives.
