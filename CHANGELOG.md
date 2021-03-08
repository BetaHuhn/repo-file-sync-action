## [v1.3.0] - 2021-03-08

[Release notes](https://github.com/betahuhn/repo-file-sync-action/releases/tag/v1.3.0) · [Compare](https://github.com/betahuhn/repo-file-sync-action/compare/v1.2.0...v1.3.0) · [Tag](https://github.com/betahuhn/repo-file-sync-action/tree/v1.3.0) · Archive ([zip](https://github.com/betahuhn/repo-file-sync-action/archive/v1.3.0.zip) · [tar.gz](https://github.com/betahuhn/repo-file-sync-action/archive/v1.3.0.tar.gz))

[repo-file-sync-action](https://github.com/betahuhn/repo-file-sync-action) will now check if there's an existing sync PR on the target repository and overwrite it with the new changes. This behavior can be turned of with the `OVERWRITE_EXISTING_PR` option.

### New features

- [`2a4e127`](https://github.com/betahuhn/repo-file-sync-action/commit/2a4e127)  Check for and overwrite existing PR

### Updates

- [`5e590a1`](https://github.com/betahuhn/repo-file-sync-action/commit/5e590a1)  Improve code structure/readability
- [`1e8745f`](https://github.com/betahuhn/repo-file-sync-action/commit/1e8745f)  Move exec function to helpers

### Bug fixes

- [`d7fe133`](https://github.com/betahuhn/repo-file-sync-action/commit/d7fe133)  Parse boolean action input as actual boolean

## [v1.2.0] - 2021-03-03

[Release notes](https://github.com/betahuhn/repo-file-sync-action/releases/tag/v1.2.0) · [Compare](https://github.com/betahuhn/repo-file-sync-action/compare/v1.1.1...v1.2.0) · [Tag](https://github.com/betahuhn/repo-file-sync-action/tree/v1.2.0) · Archive ([zip](https://github.com/betahuhn/repo-file-sync-action/archive/v1.2.0.zip) · [tar.gz](https://github.com/betahuhn/repo-file-sync-action/archive/v1.2.0.tar.gz))

### New features

- [`18215cb`](https://github.com/betahuhn/repo-file-sync-action/commit/18215cb)  Support custom GitHub Enterprise Host [#8](https://github.com/BetaHuhn/repo-file-sync-action/discussions/8)

## [v1.1.1] - 2021-01-18

[Release notes](https://github.com/betahuhn/repo-file-sync-action/releases/tag/v1.1.1) · [Compare](https://github.com/betahuhn/repo-file-sync-action/compare/v1.1.0...v1.1.1) · [Tag](https://github.com/betahuhn/repo-file-sync-action/tree/v1.1.1) · Archive ([zip](https://github.com/betahuhn/repo-file-sync-action/archive/v1.1.1.zip) · [tar.gz](https://github.com/betahuhn/repo-file-sync-action/archive/v1.1.1.tar.gz))

## [v1.1.0] - 2021-01-10

[Release notes](https://github.com/betahuhn/repo-file-sync-action/releases/tag/v1.1.0) · [Compare](https://github.com/betahuhn/repo-file-sync-action/compare/v1.0.1...v1.1.0) · [Tag](https://github.com/betahuhn/repo-file-sync-action/tree/v1.1.0) · Archive ([zip](https://github.com/betahuhn/repo-file-sync-action/archive/v1.1.0.zip) · [tar.gz](https://github.com/betahuhn/repo-file-sync-action/archive/v1.1.0.tar.gz))

### New features

- [`35e1508`](https://github.com/betahuhn/repo-file-sync-action/commit/35e1508) Cleanup tmp directories

### Bug fixes

- [`b7e5310`](https://github.com/betahuhn/repo-file-sync-action/commit/b7e5310)  Fix parsing of boolean config options [skip-ci]

## [v1.0.1] - 2021-01-09

[Release notes](https://github.com/betahuhn/repo-file-sync-action/releases/tag/v1.0.1) · [Compare](https://github.com/betahuhn/repo-file-sync-action/compare/v1.0.0...v1.0.1) · [Tag](https://github.com/betahuhn/repo-file-sync-action/tree/v1.0.1) · Archive ([zip](https://github.com/betahuhn/repo-file-sync-action/archive/v1.0.1.zip) · [tar.gz](https://github.com/betahuhn/repo-file-sync-action/archive/v1.0.1.tar.gz))

### Bug fixes

- [`40b7915`](https://github.com/betahuhn/repo-file-sync-action/commit/40b7915)  Fix parsing of multiple groups

## [v1.0.0] - 2021-01-09

[Release notes](https://github.com/betahuhn/repo-file-sync-action/releases/tag/v1.0.0) · [Tag](https://github.com/betahuhn/repo-file-sync-action/tree/v1.0.0) · Archive ([zip](https://github.com/betahuhn/repo-file-sync-action/archive/v1.0.0.zip) · [tar.gz](https://github.com/betahuhn/repo-file-sync-action/archive/v1.0.0.tar.gz))

### New features

- [`a863fe8`](https://github.com/betahuhn/repo-file-sync-action/commit/a863fe8)  Add support for directories [skip ci]

### Updates

- [`c4c6e88`](https://github.com/betahuhn/repo-file-sync-action/commit/c4c6e88)  Remove pattern option [skip ci]
- [`22cc9e5`](https://github.com/betahuhn/repo-file-sync-action/commit/22cc9e5)  Remove delete option [skip ci]

### Bug fixes

- [`bb0c4aa`](https://github.com/betahuhn/repo-file-sync-action/commit/bb0c4aa)  Use Node v12 [skip ci]
- [`1266e84`](https://github.com/betahuhn/repo-file-sync-action/commit/1266e84)  Use run_id instead of run_number [skip ci]

### Breaking changes

- [`75a118d`](https://github.com/betahuhn/repo-file-sync-action/commit/75a118d)  First release
