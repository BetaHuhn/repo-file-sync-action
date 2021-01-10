<div align="center">
  
# GitHub File Sync Action

[![Build CI](https://github.com/BetaHuhn/action-github-file-sync/workflows/Test%20CI/badge.svg)](https://github.com/BetaHuhn/action-github-file-sync/actions?query=workflow%3A%22Test+CI%22) [![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/BetaHuhn/action-github-file-sync/blob/master/LICENSE) ![David](https://img.shields.io/david/betahuhn/action-github-file-sync)

Keep files like Action workflows or entire directories in sync between multiple repositories.

</div>

## 👋 Introduction

With [action-github-file-sync](https://github.com/BetaHuhn/action-github-file-sync) you can sync files, like workflow `.yml` files, configuration files or whole directories between repositories. It works by running a GitHub Action in your main repository everytime you push something to that repo. The action will use a `sync.yml` config file to figure out which files it should sync where. If it finds a file which is out of sync it will open a pull request in the target repository with the changes.

## 🚀 Features

- Keep GitHub Actions workflow files in sync across all your repositories
- Sync any file or a whole directory to as many repositories as you want
- Easy configuration for any use case
- Create a pull request in the target repo so you have the last say on what gets merged
- Automatically label pull requests to integrate with other actions like [automerge-action](https://github.com/pascalgn/automerge-action)
- Assign users to the pull request

## 📚 Usage

Create a `.yml` file in your `.github/workflows` folder (you can find more info about the structure in the [GitHub Docs](https://docs.github.com/en/free-pro-team@latest/actions/reference/workflow-syntax-for-github-actions)):

**.github/workflows/sync.yml**

```yml
name: Sync Files
on:
  push:
    branches:
      - master
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@master
      - name: Run GitHub File Sync
        uses: BetaHuhn/action-github-file-sync@master
        with:
          GH_PAT: ${{ secrets.GH_PAT }}
```

In order for the Action to access your repositories you have to specify a [Personal Access token](https://docs.github.com/en/free-pro-team@latest/github/authenticating-to-github/creating-a-personal-access-token) as the value for `GH_PAT`.

> **Note:** `GITHUB_TOKEN` will not work

It is recommneded to set the token as a
[Repository Secret](https://docs.github.com/en/free-pro-team@latest/actions/reference/encrypted-secrets#creating-encrypted-secrets-for-a-repository).

The last step is to create a `.yml` file in the `.github` folder of your repository and specify what file(s) to sync to which repositories:

**.github/sync.yml**

```yml
user/repository:
  - .github/workflows/test.yml
  - .github/workflows/lint.yml

user/repository2:
  - source: workflows/stale.yml
    dest: .github/workflows/stale.yml
```

More info on how to specify what files to sync where [below](#%EF%B8%8F-sync-configuration).

## 🛠️ Sync Configuration

In order to tell [action-github-file-sync](https://github.com/BetaHuhn/action-github-file-sync) what files to sync where, you have to create a `sync.yml` file in the `.github` directory of your main repository (see [action-configuration](#%EF%B8%8F-action-configuration) on how to change the location).

The top-level key should be used to specify the target repository in the format `username`/`repository-name`@`branch`, after that you can list all the files you want to sync to that individual repository:

```yml
user/repo:
  - path/to/file.txt
user/repo2@develop:
  - path/to/file2.txt
```

There are multiple ways to specify which files to sync to each individual repository.

### List individual file(s)

The easiest way to sync files is the list them on a new line for each repository:

```yml
user/repo:
  - .github/workflows/build.yml
  - LICENSE
  - .gitignore
```

### Different destination path/filename(s)

Using the `dest` option you can specify a destination path in the target repo and/or change the filename for each source file:

```yml
user/repo:
  - source: workflows/build.yml
    dest: .github/workflows/build.yml
  - source: LICENSE.md
    dest: LICENSE
```

### Sync entire directories

You can also specify entire directories to sync:

```yml
user/repo:
  - source: workflows/
    dest: .github/workflows/
```

### Don't replace existing file(s)

By default if a file already exists in the target repository, it will be replaced. You can change this behaviour by setting the `replace` option to `false`:

```yml
user/repo:
  - source: .github/workflows/lint.yml
    replace: false
```

### Sync the same files to multiple repositories

Instead of repeating yourself listing the same files for multiple repositories, you can create a group:

```yml
group:
  repos: |
    user/repo
    user/repo1
  files: 
    - source: workflows/build.yml
      dest: .github/workflows/build.yml
    - source: LICENSE.md
      dest: LICENSE
```

You can create multiple groups like this:

```yml
group:
  # first group
  - files:
      - source: workflows/build.yml
        dest: .github/workflows/build.yml
      - source: LICENSE.md
        dest: LICENSE
    repos: |
      user/repo1
      user/repo2

  # second group
  - files: 
      - source: configs/dependabot.yml
        dest: .github/dependabot.yml
    repos: |
      user/repo3
      user/repo4
```

## ⚙️ Action Configuration

Here are all the inputs [action-github-file-sync](https://github.com/BetaHuhn/action-github-file-sync) takes:

```yml
CONFIG_PATH: The path to the sync configuration file
PR_LABELS: Labels which will be added to the pull request. Defaults to sync. Set to false to turn off
ASSIGNEES: People to assign to the pull request. Defaults to none
COMMIT_PREFIX: Prefix for commit message and pull request title. Defaults to 🔄
COMMIT_EACH_FILE: Commit each file seperately. Defaults to true
GIT_EMAIL: The e-mail address used to commit the synced files. Defaults to the email of the GitHub PAT
GIT_USERNAME: The username used to commit the synced files. Defaults to the username of the GitHub PAT
TMP_DIR: The working directory where all sync operations will be done. Defaults to `tmp-${ Date.now().toString() }`
DRY_RUN: Run everything except that nothing will be pushed. Defaults to false
SKIP_CLEANUP: Skips removing the temporary directory. Useful for debugging. Defaults to false
```

## 📖 Examples

Here are a few examples to help you get started!

### Basic Example

**.github/sync.yml**

```yml
user/repository:
  - LICENSE
  - .gitignore
```

### Sync all workflow files

This example will keep all your `.github/workflows` files in sync across multiple repositories:

**.github/sync.yml**

```yml
group:
  repos: |
    user/repo1
    user/repo2
  files:
    - source: .github/workflows/
      dest: .github/workflows/
```

### Custom labels

By default [action-github-file-sync](https://github.com/BetaHuhn/action-github-file-sync) will add the `sync` label to every PR it creates. You can turn this off by setting `PR_LABELS` to false, or specify your own labels:

**.github/workflows/sync.yml**

```yml
- name: Run GitHub File Sync
  uses: BetaHuhn/action-github-file-sync@master
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    PR_LABELS: |
      file-sync
      automerge
```

### Assign a user to the PR

You can tell [action-github-file-sync](https://github.com/BetaHuhn/action-github-file-sync) to assign users to the PR with `ASSIGNEES`:

**.github/workflows/sync.yml**

```yml
- name: Run GitHub File Sync
  uses: BetaHuhn/action-github-file-sync@master
  with:
    GH_PAT: ${{ secrets.GH_PAT }}
    ASSIGNEES: BetaHuhn
```

### Advanced sync config

Here's how I keep common files in sync across my repositories. The main repository [`github-files`](https://github.com/BetaHuhn/github-files) contains all the files I want to sync and the [action-github-file-sync](https://github.com/BetaHuhn/action-github-file-sync) Action which runs on every push.

Using groups I can specify which file(s) should be synced to which repositories:

**.github/sync.yml**

```yml
group:
  # dependabot files
  - files:
      - source: configs/dependabot.yml
        dest: .github/dependabot.yml
      - source: workflows/dependencies/dependabot.yml
        dest: .github/workflows/dependabot.yml
    repos: |
      BetaHuhn/do-spaces-action
      BetaHuhn/running-at
      BetaHuhn/spaces-cli
      BetaHuhn/metadata-scraper
      BetaHuhn/ejs-serve
      BetaHuhn/feedback-js
      BetaHuhn/drkmd.js

  # GitHub Sponsors config
  - files:
      - source: configs/FUNDING.yml
        dest: .github/FUNDING.yml
    repos: |
      BetaHuhn/do-spaces-action
      BetaHuhn/running-at
      BetaHuhn/spaces-cli
      BetaHuhn/qrgen
      BetaHuhn/metadata-scraper
      BetaHuhn/ejs-serve
      BetaHuhn/feedback-js
      BetaHuhn/drkmd.js

  # Semantic release
  - files:
      - source: workflows/versioning/release-scheduler.yml
        dest: .github/workflows/release-scheduler.yml
      - source: workflows/versioning/release.yml
        dest: .github/workflows/release.yml
      - source: configs/release.config.js
        dest: release.config.js
    repos: |
      BetaHuhn/do-spaces-action
      BetaHuhn/metadata-scraper
      BetaHuhn/feedback-js
      BetaHuhn/drkmd.js

  # Stale issues workflow
  - files:
      - source: workflows/issues/stale.yml
        dest: .github/workflows/stale.yml
    repos: |
      BetaHuhn/do-spaces-action
      BetaHuhn/running-at
      BetaHuhn/spaces-cli
      BetaHuhn/qrgen
      BetaHuhn/metadata-scraper
      BetaHuhn/ejs-serve
      BetaHuhn/feedback-js
      BetaHuhn/drkmd.js

  # Lint CI workflow
  - files:
      - source: workflows/node/lint.yml
        dest: .github/workflows/lint.yml
    repos: |
      BetaHuhn/do-spaces-action
      BetaHuhn/running-at
      BetaHuhn/spaces-cli
      BetaHuhn/metadata-scraper
      BetaHuhn/ejs-serve
      BetaHuhn/feedback-js
      BetaHuhn/drkmd.js

  # MIT License
  - files:
      - source: LICENSE
        dest: LICENSE
    repos: |
      BetaHuhn/do-spaces-action
      BetaHuhn/running-at
      BetaHuhn/spaces-cli
      BetaHuhn/qrgen
      BetaHuhn/metadata-scraper
      BetaHuhn/ejs-serve
      BetaHuhn/feedback-js
      BetaHuhn/drkmd.js
```

## 💻 Development

Issues and PRs are very welcome!

The actual source code of this library is in the `src` folder.

- run `yarn lint` or `npm run lint` to run eslint.
- run `yarn start` or `npm run start` to run the Action locally.
- run `yarn build` or `npm run build` to produce a production version of [action-github-file-sync](https://github.com/BetaHuhn/action-github-file-sync) in the `dist` folder.

## ❔ About

This project was developed by me ([@betahuhn](https://github.com/BetaHuhn)) in my free time. If you want to support me:

[![Donate via PayPal](https://img.shields.io/badge/paypal-donate-009cde.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=394RTSBEEEFEE)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F81S2RK)

### Credits

This Action was inspired by:

- [action-github-workflow-sync](https://github.com/varunsridharan/action-github-workflow-sync)
- [files-sync-action](https://github.com/adrianjost/files-sync-action)

## 📄 License

Copyright 2021 Maximilian Schiller

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
