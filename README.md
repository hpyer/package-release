# package-release

[![Build Status](https://app.travis-ci.com/hpyer/package-release.svg?branch=main)](https://app.travis-ci.com/hpyer/package-release)

A command-line tool that helps you to generate changelogs from git-log, update the version of package.json and auto commit with tag.

## Install

`npm install -D package-release`

or install with `yarn`

`yarn add -D package-release`

## Useage

```shell
# Run this command in the root of your project
npx package-release

# Upgrade specific part of version
npx package-release -t patch

# Upgrade to custom version
npx package-release -v 2.3.4

# Upgrade and auto push to git remote
npx package-release -p
```

## Custom

You can add `package-release` section into `package.json` to custom head-line and git commit types.

Example of `package.json`:

```json
{
  // ...
  "devDependencies": {
    // ...
    "package-release": "^1.0.0"
  },
  "package-release": {
    // head-line of CHANGELOG.md
    "header": "# CHANGELOG",
    // commit types that will write into CHANGELOG.md
    // USED_TYPE: DISPLAY_TYPE
    "types": {
      "feat": "Feat",
      "fix": "Fix",
      "docs": "Docs",
      "perf": "Perf",
      "refactor": "Refactor"
    }
  }
}
```

## Notice

**You should commit changes with the follow message format:**

`type(scope): content`

- `type`: **Required**, such as `fix`, 'fixed', `feat`, `feature` and so on.
- `content`: **Required**, change description.
- `(scope)`: Optional, such as `login`, 'order' and so on.

Examples:

- `feat: Add login module`
- `fix(login): Fix account check`
- `chore: Add package package-release`
- `docs: Update README.md`

## Excample of CHANGELOG file

```markdown
# CHANGELOG


## v1.2.0 (2022-04-15)

- Feat: Add new script
- Feat: Add another script

- Fix: Fix(#12)
- Fix: Fix(#13)

- Refactor: Change output format

## v1.1.0 (2022-04-10)

- Perf: Update content to 1.1.0

## v1.0.1 (2022-03-31)

- Feat: Add login module

- Perf: Update content to 1.0.1

## v1.0.0 (2022-03-30)

```
