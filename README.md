# action-github-file-sync

🚧 **UNDER DEVELOPMENT** 🚧

## Usage

Use the `sync.yml` file to specify which files should be synced to which repos.

The top-level key should be used to specify the target repository in the format `username`/`repository-name`@`branch`, after that you can list all the files you want to sync to that individual repository:

```yml
user/repo:
  - path/to/file.txt
user/repo2:
  - path/to/file2.txt
```

There are multiple ways to specify which files to sync to each individual repository.

### List individual files

```yml
user/repo:
  - .github/workflows/build.yml
  - LICENSE
  - .gitignore
```

### Different destination path/filename

```yml
user/repo:
  - source: workflows/build.yml
    dest: .github/workflows/build.yml
  - source: LICENSE.md
    dest: LICENSE
```

### Sync entire directories (coming soon)

```yml
user/repo:
  - source: workflows/build.yml
    dest: .github/workflows/build.yml
  - source: LICENSE.md
    dest: LICENSE
```

### Don't replace existing file

```yml
user/repo:
  - source: .github/workflows/lint.yml
    replace: false
```

### Sync the same files to multiple repositories

```yml
group:
  repos: |
    user/repo
    user/repo
  files: 
    - source: workflows/build.yml
      dest: .github/workflows/build.yml
    - source: LICENSE.md
      dest: LICENSE
```
