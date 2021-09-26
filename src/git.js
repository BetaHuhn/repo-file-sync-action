const { parse } = require('@putout/git-status-porcelain')
const core = require('@actions/core')
const github = require('@actions/github')
const { GitHub, getOctokitOptions } = require('@actions/github/lib/utils')
const { throttling } = require('@octokit/plugin-throttling')
const path = require('path')

const {
	GITHUB_TOKEN,
	IS_INSTALLATION_TOKEN,
	GIT_USERNAME,
	GIT_EMAIL,
	TMP_DIR,
	COMMIT_BODY,
	COMMIT_PREFIX,
	GITHUB_REPOSITORY,
	OVERWRITE_EXISTING_PR,
	PR_BODY,
	BRANCH_PREFIX
} = require('./config')

const { dedent, execCmd } = require('./helpers')

class Git {
	constructor() {
		const Octokit = GitHub.plugin(throttling)

		const options = getOctokitOptions(GITHUB_TOKEN, {
			throttle: {
				onRateLimit: (retryAfter, options) => {
					core.warning(`Request quota exhausted for request ${ options.method } ${ options.url }`)

					if (options.request.retryCount === 0) {
						// only retries once
						core.info(`Retrying after ${ retryAfter } seconds!`)
						return true
					}
				},
				onAbuseLimit: (retryAfter, options) => {
					// does not retry, only logs a warning
					core.warning(`Abuse detected for request ${ options.method } ${ options.url }`)
				}
			}
		})

		const octokit = new Octokit(options)

		// We only need the rest client
		this.github = octokit.rest
	}

	async initRepo(repo) {
		// Reset repo specific values
		this.existingPr = undefined
		this.prBranch = undefined
		this.baseBranch = undefined

		// Set values to current repo
		this.repo = repo
		this.workingDir = path.join(TMP_DIR, repo.uniqueName)
		this.gitUrl = `https://${ IS_INSTALLATION_TOKEN ? 'x-access-token:' : '' }${ GITHUB_TOKEN }@${ repo.fullName }.git`

		await this.clone()
		await this.setIdentity()
		await this.getBaseBranch()
	}

	async clone() {
		core.debug(`Cloning ${ this.repo.fullName } into ${ this.workingDir }`)

		return execCmd(
			`git clone --depth 1 ${ this.repo.branch !== 'default' ? '--branch "' + this.repo.branch + '"' : '' } ${ this.gitUrl } ${ this.workingDir }`
		)
	}

	async setIdentity() {
		let username = GIT_USERNAME
		let email = GIT_EMAIL

		if (email === undefined) {
			if (IS_INSTALLATION_TOKEN) {
				core.setFailed('When using an installation token you must provide GIT_EMAIL and GIT_USERNAME')
				process.exit(1)
			}
			const { data } = await this.github.users.getAuthenticated()
			email = data.email
			username = data.login
		}

		core.debug(`Setting git user to email: ${ email }, username: ${ username }`)

		return execCmd(
			`git config --local user.name "${ username }" && git config --local user.email "${ email }"`,
			this.workingDir
		)
	}

	async getBaseBranch() {
		this.baseBranch = await execCmd(
			`git rev-parse --abbrev-ref HEAD`,
			this.workingDir
		)
	}

	async createPrBranch() {
		const prefix = BRANCH_PREFIX.replace('SOURCE_REPO_NAME', GITHUB_REPOSITORY.split('/')[1])

		let newBranch = path.join(prefix, this.repo.branch)

		if (OVERWRITE_EXISTING_PR === false) {
			newBranch += `-${ Math.round((new Date()).getTime() / 1000) }`
		}

		core.debug(`Creating PR Branch ${ newBranch }`)

		await execCmd(
			`git checkout -b "${ newBranch }"`,
			this.workingDir
		)

		this.prBranch = newBranch
	}

	async add(file) {
		return execCmd(
			`git add -f ${ file }`,
			this.workingDir
		)
	}

	isOneCommitPush() {
		return github.context.eventName === 'push' && github.context.payload.commits.length === 1
	}

	originalCommitMessage() {
		return github.context.payload.commits[0].message
	}

	parseGitDiffOutput(string) { // parses git diff output and returns a dictionary mapping the file path to the diff output for this file
		// split diff into separate entries for separate files. \ndiff --git should be a reliable way to detect the separation, as content of files is always indented
		return `\n${ string }`.split('\ndiff --git').slice(1).reduce((resultDict, fileDiff) => {
			const lines = fileDiff.split('\n')
			const lastHeaderLineIndex = lines.findIndex((line) => line.startsWith('+++'))
			const plainDiff = lines.slice(lastHeaderLineIndex + 1).join('\n').trim()
			let filePath = ''
			if (lines[lastHeaderLineIndex].startsWith('+++ b/')) { // every file except removed files
				filePath = lines[lastHeaderLineIndex].slice(6) // remove '+++ b/'
			} else { // for removed file need to use header line with filename before deletion
				filePath = lines[lastHeaderLineIndex - 1].slice(6) // remove '--- a/'
			}
			return { ...resultDict, [filePath]: plainDiff }
		}, {})
	}

	async getChangesFromLastCommit(source) { // gets array of git diffs for the source, which either can be a file or a dict
		if (this.lastCommitChanges === undefined) {
			const diff = await this.github.repos.compareCommits({
				mediaType: {
					format: 'diff'
				},
				owner: github.context.payload.repository.owner.name,
				repo: github.context.payload.repository.name,
				base: github.context.payload.before,
				head: github.context.payload.after
			})
			this.lastCommitChanges = this.parseGitDiffOutput(diff.data)
		}
		if (source.endsWith('/')) {
			return Object.keys(this.lastCommitChanges).filter((filePath) => filePath.startsWith(source)).reduce((result, key) => [ ...result, this.lastCommitChanges[key] ], [])
		} else {
			return this.lastCommitChanges[source] === undefined ? [] : [ this.lastCommitChanges[source] ]
		}
	}

	async changes(destination) { // gets array of git diffs for the destination, which either can be a file or a dict
		const output = await execCmd(
			`git diff HEAD ${ destination }`,
			this.workingDir
		)
		return Object.values(this.parseGitDiffOutput(output))
	}

	async hasChanges() {
		const statusOutput = await execCmd(
			`git status --porcelain`,
			this.workingDir
		)

		return parse(statusOutput).length !== 0
	}

	async commit(msg) {
		let message = msg !== undefined ? msg : `${ COMMIT_PREFIX } Synced file(s) with ${ GITHUB_REPOSITORY }`
		if (COMMIT_BODY) {
			message += `\n\n${ COMMIT_BODY }`
		}
		return execCmd(
			`git commit -m "${ message.replace(/"/g, '\\"') }"`,
			this.workingDir
		)
	}

	async status() {
		return execCmd(
			`git status`,
			this.workingDir
		)
	}

	async push() {
		return execCmd(
			`git push ${ this.gitUrl } --force`,
			this.workingDir
		)
	}

	async findExistingPr() {
		const { data } = await this.github.pulls.list({
			owner: this.repo.user,
			repo: this.repo.name,
			state: 'open',
			head: `${ this.repo.user }:${ this.prBranch }`
		})

		this.existingPr = data[0]

		return this.existingPr
	}

	async setPrWarning() {
		await this.github.pulls.update({
			owner: this.repo.user,
			repo: this.repo.name,
			pull_number: this.existingPr.number,
			body: dedent(`
				⚠️ This PR is being automatically resynced ⚠️

				${ this.existingPr.body }
			`)
		})
	}

	async removePrWarning() {
		await this.github.pulls.update({
			owner: this.repo.user,
			repo: this.repo.name,
			pull_number: this.existingPr.number,
			body: this.existingPr.body.replace('⚠️ This PR is being automatically resynced ⚠️', '')
		})
	}

	async createOrUpdatePr(changedFiles, title) {
		const body = dedent(`
			Synced local file(s) with [${ GITHUB_REPOSITORY }](https://github.com/${ GITHUB_REPOSITORY }).

			${ PR_BODY }
			
			${ changedFiles }

			---

			This PR was created automatically by the [repo-file-sync-action](https://github.com/BetaHuhn/repo-file-sync-action) workflow run [#${ process.env.GITHUB_RUN_ID || 0 }](https://github.com/${ GITHUB_REPOSITORY }/actions/runs/${ process.env.GITHUB_RUN_ID || 0 })
		`)

		if (this.existingPr) {
			core.info(`Overwriting existing PR`)

			const { data } = await this.github.pulls.update({
				owner: this.repo.user,
				repo: this.repo.name,
				title: `${ COMMIT_PREFIX } Synced file(s) with ${ GITHUB_REPOSITORY }`,
				pull_number: this.existingPr.number,
				body: body
			})

			return data
		}

		core.info(`Creating new PR`)

		const { data } = await this.github.pulls.create({
			owner: this.repo.user,
			repo: this.repo.name,
			title: title === undefined ? `${ COMMIT_PREFIX } Synced file(s) with ${ GITHUB_REPOSITORY }` : title,
			body: body,
			head: this.prBranch,
			base: this.baseBranch
		})

		this.existingPr = data

		return data
	}

	async addPrLabels(labels) {
		await this.github.issues.addLabels({
			owner: this.repo.user,
			repo: this.repo.name,
			issue_number: this.existingPr.number,
			labels: labels
		})
	}

	async addPrAssignees(assignees) {
		await this.github.issues.addAssignees({
			owner: this.repo.user,
			repo: this.repo.name,
			issue_number: this.existingPr.number,
			assignees: assignees
		})
	}
}

module.exports = Git