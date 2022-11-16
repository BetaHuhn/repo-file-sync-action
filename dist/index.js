/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 827:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(105)
const yaml = __nccwpck_require__(982)
const fs = __nccwpck_require__(653)
const path = __nccwpck_require__(17)
const { getInput } = __nccwpck_require__(340)

const REPLACE_DEFAULT = true
const DELETE_ORPHANED_DEFAULT = false

let context

try {

	let isInstallationToken = false
	let token = getInput({
		key: 'GH_PAT'
	})

	if (!token) {
		token = getInput({
			key: 'GH_INSTALLATION_TOKEN'
		})
		isInstallationToken = true
		if (!token) {
			core.setFailed('You must provide either GH_PAT or GH_INSTALLATION_TOKEN')
			process.exit(1)
		}
	}

	context = {
		GITHUB_TOKEN: token,
		IS_INSTALLATION_TOKEN: isInstallationToken,
		GIT_EMAIL: getInput({
			key: 'GIT_EMAIL'
		}),
		GIT_USERNAME: getInput({
			key: 'GIT_USERNAME'
		}),
		CONFIG_PATH: getInput({
			key: 'CONFIG_PATH',
			default: '.github/sync.yml'
		}),
		COMMIT_BODY: getInput({
			key: 'COMMIT_BODY',
			default: ''
		}),
		COMMIT_PREFIX: getInput({
			key: 'COMMIT_PREFIX',
			default: '🔄'
		}),
		COMMIT_EACH_FILE: getInput({
			key: 'COMMIT_EACH_FILE',
			type: 'boolean',
			default: true
		}),
		PR_LABELS: getInput({
			key: 'PR_LABELS',
			default: [ 'sync' ],
			type: 'array',
			disableable: true
		}),
		PR_BODY: getInput({
			key: 'PR_BODY',
			default: ''
		}),
		ASSIGNEES: getInput({
			key: 'ASSIGNEES',
			type: 'array'
		}),
		REVIEWERS: getInput({
			key: 'REVIEWERS',
			type: 'array'
		}),
		TEAM_REVIEWERS: getInput({
			key: 'TEAM_REVIEWERS',
			type: 'array'
		}),
		TMP_DIR: getInput({
			key: 'TMP_DIR',
			default: `tmp-${ Date.now().toString() }`
		}),
		DRY_RUN: getInput({
			key: 'DRY_RUN',
			type: 'boolean',
			default: false
		}),
		SKIP_CLEANUP: getInput({
			key: 'SKIP_CLEANUP',
			type: 'boolean',
			default: false
		}),
		OVERWRITE_EXISTING_PR: getInput({
			key: 'OVERWRITE_EXISTING_PR',
			type: 'boolean',
			default: true
		}),
		GITHUB_REPOSITORY: getInput({
			key: 'GITHUB_REPOSITORY',
			required: true
		}),
		SKIP_PR: getInput({
			key: 'SKIP_PR',
			type: 'boolean',
			default: false
		}),
		ORIGINAL_MESSAGE: getInput({
			key: 'ORIGINAL_MESSAGE',
			type: 'boolean',
			default: false
		}),
		COMMIT_AS_PR_TITLE: getInput({
			key: 'COMMIT_AS_PR_TITLE',
			type: 'boolean',
			default: false
		}),
		BRANCH_PREFIX: getInput({
			key: 'BRANCH_PREFIX',
			default: 'repo-sync/SOURCE_REPO_NAME'
		}),
		FORK: getInput({
			key: 'FORK',
			default: false,
			disableable: true
		})
	}

	core.setSecret(context.GITHUB_TOKEN)

	core.debug(JSON.stringify(context, null, 2))

	while (fs.existsSync(context.TMP_DIR)) {
		context.TMP_DIR = `tmp-${ Date.now().toString() }`
		core.warning(`TEMP_DIR already exists. Using "${ context.TMP_DIR }" now.`)
	}

} catch (err) {
	core.setFailed(err.message)
	process.exit(1)
}

const parseRepoName = (fullRepo) => {
	let host = 'github.com'

	if (fullRepo.startsWith('http')) {
		const url = new URL(fullRepo)
		host = url.host

		fullRepo = url.pathname.replace(/^\/+/, '') // Remove leading slash

		core.info('Using custom host')
	}

	const user = fullRepo.split('/')[0]
	const name = fullRepo.split('/')[1].split('@')[0]
	const branch = fullRepo.split('@')[1] || 'default'

	return {
		fullName: `${ host }/${ user }/${ name }`,
		uniqueName: `${ host }/${ user }/${ name }@${ branch }`,
		host,
		user,
		name,
		branch
	}
}

const parseExclude = (text, src) => {
	if (text === undefined || typeof text !== 'string') return undefined

	const files = text.split('\n').filter((i) => i)

	return files.map((file) => path.join(src, file))
}

const parseFiles = (files) => {
	return files.map((item) => {

		if (typeof item === 'string') {
			return {
				source: item,
				dest: item,
				replace: REPLACE_DEFAULT,
				deleteOrphaned: DELETE_ORPHANED_DEFAULT
			}
		}

		if (item.source !== undefined) {
			return {
				source: item.source,
				dest: item.dest || item.source,
				replace: item.replace === undefined ? REPLACE_DEFAULT : item.replace,
				deleteOrphaned: item.deleteOrphaned === undefined ? DELETE_ORPHANED_DEFAULT : item.deleteOrphaned,
				exclude: parseExclude(item.exclude, item.source)
			}
		}

		core.warning('Warn: No source files specified')
	})
}

const parseConfig = async () => {
	const fileContent = await fs.promises.readFile(context.CONFIG_PATH)

	const configObject = yaml.load(fileContent.toString())

	const result = {}

	Object.keys(configObject).forEach((key) => {
		if (key === 'group') {
			const rawObject = configObject[key]

			const groups = Array.isArray(rawObject) ? rawObject : [ rawObject ]

			groups.forEach((group) => {
				const repos = typeof group.repos === 'string' ? group.repos.split('\n').map((n) => n.trim()).filter((n) => n) : group.repos

				repos.forEach((name) => {
					const files = parseFiles(group.files)
					const repo = parseRepoName(name)

					if (result[repo.uniqueName] !== undefined) {
						result[repo.uniqueName].files.push(...files)
						return
					}

					result[repo.uniqueName] = {
						repo,
						files
					}
				})
			})
		} else {
			const files = parseFiles(configObject[key])
			const repo = parseRepoName(key)

			if (result[repo.uniqueName] !== undefined) {
				result[repo.uniqueName].files.push(...files)
				return
			}

			result[repo.uniqueName] = {
				repo,
				files
			}
		}
	})

	return Object.values(result)
}

module.exports = {
	...context,
	parseConfig
}

/***/ }),

/***/ 940:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const { parse } = __nccwpck_require__(125)
const core = __nccwpck_require__(105)
const github = __nccwpck_require__(82)
const { GitHub, getOctokitOptions } = __nccwpck_require__(35)
const { throttling } = __nccwpck_require__(123)
const path = __nccwpck_require__(17)
const fs = __nccwpck_require__(147)

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
	SKIP_PR,
	PR_BODY,
	BRANCH_PREFIX,
	FORK
} = __nccwpck_require__(827)

const { dedent, execCmd } = __nccwpck_require__(146)

class Git {
	constructor() {
		const Octokit = GitHub.plugin(throttling)

		const options = getOctokitOptions(GITHUB_TOKEN, {
			throttle: {
				onRateLimit: (retryAfter) => {
					core.debug(`Hit GitHub API rate limit, retrying after ${ retryAfter }s`)
					return true
				},
				onSecondaryRateLimit: (retryAfter) => {
					core.debug(`Hit secondary GitHub API rate limit, retrying after ${ retryAfter }s`)
					return true
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
		await this.getLastCommitSha()

		if (FORK) {
			const forkUrl = `https://${ GITHUB_TOKEN }@github.com/${ FORK }/${ this.repo.name }.git`
			await this.createFork()
			await this.createRemote(forkUrl)

		}
	}

	async createFork() {
		core.debug(`Creating fork with OWNER: ${ this.repo.user } and REPO: ${ this.repo.name }`)
		await this.github.repos.createFork({
			owner: this.repo.user,
			repo: this.repo.name
		})
	}

	async createRemote(forkUrl) {
		return execCmd(
			`git remote add fork ${ forkUrl }`,
			this.workingDir
		)
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
			if (!IS_INSTALLATION_TOKEN) {
				const { data } = await this.github.users.getAuthenticated()
				email = data.email
				username = data.login
			}
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

		let newBranch = path.join(prefix, this.repo.branch).replace(/\\/g, '/').replace(/\/\./g, '/')

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
			`git add -f "${ file }"`,
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
			if (lastHeaderLineIndex === -1) return resultDict // ignore binary files

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

	async getBlobBase64Content(file) {
		const fileRelativePath = path.join(this.workingDir, file)
		const fileContent = await fs.promises.readFile(fileRelativePath)

		return fileContent.toString('base64')
	}

	async getLastCommitSha() {
		this.lastCommitSha = await execCmd(
			`git rev-parse HEAD`,
			this.workingDir
		)
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
			`git commit -m '${ message.replace(/'/g, '\'\\\'\'') }'`,
			this.workingDir
		)
	}

	// Returns a git tree parsed for the specified commit sha
	async getTree(commitSha) {
		const output = await execCmd(
			`git ls-tree -r --full-tree ${ commitSha }`,
			this.workingDir
		)

		const tree = []
		for (const treeObject of output.split('\n')) {
			const [ mode, type, sha ] = treeObject.split(/\s/)
			const file = treeObject.split('\t')[1]

			const treeEntry = {
				mode,
				type,
				sha,
				path: file
			}

			tree.push(treeEntry)
		}

		return tree
	}

	// Creates the blob objects in GitHub for the files that are not in the previous commit only
	async createGithubBlobs(commitSha) {
		core.debug('Creating missing blobs on GitHub')
		const [ previousTree, tree ] = await Promise.all([ this.getTree(`${ commitSha }~1`), this.getTree(commitSha) ])
		const promisesGithubCreateBlobs = []

		for (const treeEntry of tree) {
			// If the current treeEntry are in the previous tree, that means that the blob is uploaded and it doesn't need to be uploaded to GitHub again.
			if (previousTree.findIndex((entry) => entry.sha === treeEntry.sha) !== -1) {
				continue
			}

			const base64Content = await this.getBlobBase64Content(treeEntry.path)

			// Creates the blob. We don't need to store the response because the local sha is the same and we can use it to reference the blob
			const githubCreateBlobRequest = this.github.git.createBlob({
				owner: this.repo.user,
				repo: this.repo.name,
				content: base64Content,
				encoding: 'base64'
			})
			promisesGithubCreateBlobs.push(githubCreateBlobRequest)
		}

		// Wait for all the file uploads to be completed
		await Promise.all(promisesGithubCreateBlobs)
	}

	// Gets the commit list in chronological order
	async getCommitsToPush() {
		const output = await execCmd(
			`git log --format=%H --reverse ${ SKIP_PR === false ? `` : `origin/` }${ this.baseBranch }..HEAD`,
			this.workingDir
		)

		const commits = output.split('\n')
		return commits
	}

	async getCommitMessage(commitSha) {
		return await execCmd(
			`git log -1 --format=%B ${ commitSha }`,
			this.workingDir
		)
	}

	// Returns an array of objects with the git tree and the commit, one entry for each pending commit to push
	async getCommitsDataToPush() {
		const commitsToPush = await this.getCommitsToPush()

		const commitsData = []
		for (const commitSha of commitsToPush) {
			const [ commitMessage, tree ] = await Promise.all([ this.getCommitMessage(commitSha), this.getTree(commitSha), this.createGithubBlobs(commitSha) ])
			const commitData = {
				commitMessage,
				tree
			}
			commitsData.push(commitData)
		}
		return commitsData
	}

	// A wrapper for running all the flow to generate all the pending commits using the GitHub API
	async createGithubVerifiedCommits() {
		const commitsData = await this.getCommitsDataToPush()

		if (SKIP_PR === false) {
			// Creates the PR branch if doesn't exists
			try {
				await this.github.git.createRef({
					owner: this.repo.user,
					repo: this.repo.name,
					sha: this.lastCommitSha,
					ref: 'refs/heads/' + this.prBranch
				})

				core.debug(`Created new branch ${ this.prBranch }`)
			} catch (error) {
				// If the branch exists ignores the error
				if (error.message !== 'Reference already exists') throw error
			}
		}

		for (const commitData of commitsData) {
			await this.createGithubTreeAndCommit(commitData.tree, commitData.commitMessage)
		}

		core.debug(`Updating branch ${ SKIP_PR === false ? this.prBranch : this.baseBranch } ref`)
		await this.github.git.updateRef({
			owner: this.repo.user,
			repo: this.repo.name,
			ref: `heads/${ SKIP_PR === false ? this.prBranch : this.baseBranch }`,
			sha: this.lastCommitSha,
			force: true
		})
		core.debug(`Commit using GitHub API completed`)
	}

	async status() {
		return execCmd(
			`git status`,
			this.workingDir
		)
	}

	async push() {
		if (FORK) {
			return execCmd(
				`git push -u fork ${ this.prBranch } --force`,
				this.workingDir
			)
		}
		if (IS_INSTALLATION_TOKEN) {
			return await this.createGithubVerifiedCommits()
		}
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
			head: `${ FORK ? FORK : this.repo.user }:${ this.prBranch }`
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
			head: `${ FORK ? FORK : this.repo.user }:${ this.prBranch }`,
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

	async addPrReviewers(reviewers) {
		await this.github.pulls.requestReviewers({
			owner: this.repo.user,
			repo: this.repo.name,
			pull_number: this.existingPr.number,
			reviewers: reviewers
		})
	}

	async addPrTeamReviewers(reviewers) {
		await this.github.pulls.requestReviewers({
			owner: this.repo.user,
			repo: this.repo.name,
			pull_number: this.existingPr.number,
			team_reviewers: reviewers
		})
	}

	async createGithubTreeAndCommit(tree, commitMessage) {
		core.debug(`Creating a GitHub tree`)
		let treeSha
		try {
			const request = await this.github.git.createTree({
				owner: this.repo.user,
				repo: this.repo.name,
				tree
			})
			treeSha = request.data.sha
		} catch (error) {
			error.message = `Cannot create a new GitHub Tree: ${ error.message }`
			throw error
		}

		core.debug(`Creating a commit for the GitHub tree`)
		const request = await this.github.git.createCommit({
			owner: this.repo.user,
			repo: this.repo.name,
			message: commitMessage,
			parents: [ this.lastCommitSha ],
			tree: treeSha
		})
		this.lastCommitSha = request.data.sha
	}
}

module.exports = Git

/***/ }),

/***/ 146:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const fs = __nccwpck_require__(653)
const readfiles = __nccwpck_require__(782)
const { exec } = __nccwpck_require__(81)
const core = __nccwpck_require__(105)
const path = __nccwpck_require__(17)

// From https://github.com/toniov/p-iteration/blob/master/lib/static-methods.js - MIT © Antonio V
const forEach = async (array, callback) => {
	for (let index = 0; index < array.length; index++) {
		// eslint-disable-next-line callback-return
		await callback(array[index], index, array)
	}
}

// From https://github.com/MartinKolarik/dedent-js/blob/master/src/index.ts - MIT © 2015 Martin Kolárik
const dedent = function(templateStrings, ...values) {
	const matches = []
	const strings = typeof templateStrings === 'string' ? [ templateStrings ] : templateStrings.slice()
	strings[strings.length - 1] = strings[strings.length - 1].replace(/\r?\n([\t ]*)$/, '')
	for (let i = 0; i < strings.length; i++) {
		let match
		// eslint-disable-next-line no-cond-assign
		if (match = strings[i].match(/\n[\t ]+/g)) {
			matches.push(...match)
		}
	}
	if (matches.length) {
		const size = Math.min(...matches.map((value) => value.length - 1))
		const pattern = new RegExp(`\n[\t ]{${ size }}`, 'g')
		for (let i = 0; i < strings.length; i++) {
			strings[i] = strings[i].replace(pattern, '\n')
		}
	}
	strings[0] = strings[0].replace(/^\r?\n/, '')
	let string = strings[0]
	for (let i = 0; i < values.length; i++) {
		string += values[i] + strings[i + 1]
	}
	return string
}

const execCmd = (command, workingDir, trimResult = true) => {
	core.debug(`EXEC: "${ command }" IN ${ workingDir }`)
	return new Promise((resolve, reject) => {
		exec(
			command,
			{
				cwd: workingDir
			},
			function(error, stdout) {
				error ? reject(error) : resolve(
					trimResult ? stdout.trim() : stdout
				)
			}
		)
	})
}

const addTrailingSlash = (str) => str.endsWith('/') ? str : str + '/'

const pathIsDirectory = async (path) => {
	const stat = await fs.lstat(path)
	return stat.isDirectory()
}

const copy = async (src, dest, deleteOrphaned, exclude) => {

	core.debug(`CP: ${ src } TO ${ dest }`)

	const filterFunc = (file) => {


        if(exclude !== undefined){
           
            //Check if file-path is one of the present filepaths in the excluded paths
            //This has presedence over the single file, and therefore returns before the single file check
            let file_path = ''
            if (file.endsWith('/')) {
                //File item is a folder
                file_path = file
            } else {
                //File item is a file
                file_path = file.split('\/').slice(0,-1).join('/')+'/'
            }
            
            if (exclude.includes(file_path)) {
			    core.debug(`Excluding file ${ file } since its path is included as one of the excluded paths.`)
                return false
            }
                
                
            //Or if the file itself is in the excluded files
		    if (exclude.includes(file)) {
			    core.debug(`Excluding file ${ file } since it is explicitly added in the exclusion list.`)
			    return false
		    }
        }
		return true
	}

	await fs.copy(src, dest, exclude !== undefined && { filter: filterFunc })

	// If it is a directory and deleteOrphaned is enabled - check if there are any files that were removed from source dir and remove them in destination dir
	if (deleteOrphaned) {

		const srcFileList = await readfiles(src, { readContents: false, hidden: true })
		const destFileList = await readfiles(dest, { readContents: false, hidden: true })

		for (const file of destFileList) {
			if (srcFileList.indexOf(file) === -1) {
				const filePath = path.join(dest, file)
				core.debug(`Found a orphaned file in the target repo - ${ filePath }`)

				if (exclude !== undefined && exclude.includes(path.join(src, file))) {
					core.debug(`Excluding file ${ file }`)
				} else {
					core.debug(`Removing file ${ file }`)
					await fs.remove(filePath)
				}
			}
		}
	}
}

const remove = async (src) => {

	core.debug(`RM: ${ src }`)

	return fs.remove(src)
}

const arrayEquals = (array1, array2) => Array.isArray(array1) && Array.isArray(array2) && array1.length === array2.length && array1.every((value, i) => value === array2[i])

module.exports = {
	forEach,
	dedent,
	addTrailingSlash,
	pathIsDirectory,
	execCmd,
	copy,
	remove,
	arrayEquals
}


/***/ }),

/***/ 105:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 82:
/***/ ((module) => {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 35:
/***/ ((module) => {

module.exports = eval("require")("@actions/github/lib/utils");


/***/ }),

/***/ 123:
/***/ ((module) => {

module.exports = eval("require")("@octokit/plugin-throttling");


/***/ }),

/***/ 125:
/***/ ((module) => {

module.exports = eval("require")("@putout/git-status-porcelain");


/***/ }),

/***/ 340:
/***/ ((module) => {

module.exports = eval("require")("action-input-parser");


/***/ }),

/***/ 653:
/***/ ((module) => {

module.exports = eval("require")("fs-extra");


/***/ }),

/***/ 982:
/***/ ((module) => {

module.exports = eval("require")("js-yaml");


/***/ }),

/***/ 782:
/***/ ((module) => {

module.exports = eval("require")("node-readfiles");


/***/ }),

/***/ 81:
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 17:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const core = __nccwpck_require__(105)
const fs = __nccwpck_require__(147)

const Git = __nccwpck_require__(940)
const { forEach, dedent, addTrailingSlash, pathIsDirectory, copy, remove, arrayEquals } = __nccwpck_require__(146)

const {
	parseConfig,
	COMMIT_EACH_FILE,
	COMMIT_PREFIX,
	PR_LABELS,
	ASSIGNEES,
	DRY_RUN,
	TMP_DIR,
	SKIP_CLEANUP,
	OVERWRITE_EXISTING_PR,
	SKIP_PR,
	ORIGINAL_MESSAGE,
	COMMIT_AS_PR_TITLE,
	FORK,
	REVIEWERS,
	TEAM_REVIEWERS
} = __nccwpck_require__(827)

const run = async () => {
	// Reuse octokit for each repo
	const git = new Git()

	const repos = await parseConfig()

	const prUrls = []

	await forEach(repos, async (item) => {
		core.info(`Repository Info`)
		core.info(`Slug		: ${ item.repo.name }`)
		core.info(`Owner		: ${ item.repo.user }`)
		core.info(`Https Url	: https://${ item.repo.fullName }`)
		core.info(`Branch		: ${ item.repo.branch }`)
		core.info('	')
		try {

			// Clone and setup the git repository locally
			await git.initRepo(item.repo)

			let existingPr
			if (SKIP_PR === false) {
				await git.createPrBranch()

				// Check for existing PR and add warning message that the PR maybe about to change
				existingPr = OVERWRITE_EXISTING_PR ? await git.findExistingPr() : undefined
				if (existingPr && DRY_RUN === false) {
					core.info(`Found existing PR ${ existingPr.number }`)
					await git.setPrWarning()
				}
			}

			core.info(`Locally syncing file(s) between source and target repository`)
			const modified = []

			// Loop through all selected files of the source repo
			await forEach(item.files, async (file) => {
				const fileExists = fs.existsSync(file.source)
				if (fileExists === false) return core.warning(`Source ${ file.source } not found`)

				const localDestination = `${ git.workingDir }/${ file.dest }`

				const destExists = fs.existsSync(localDestination)
				if (destExists === true && file.replace === false) return core.warning(`File(s) already exist(s) in destination and 'replace' option is set to false`)

				const isDirectory = await pathIsDirectory(file.source)
				const source = isDirectory ? `${ addTrailingSlash(file.source) }` : file.source
				const dest = isDirectory ? `${ addTrailingSlash(localDestination) }` : localDestination

				if (isDirectory) core.info(`Source is directory`)

				const deleteOrphaned = isDirectory && file.deleteOrphaned

				await copy(source, dest, deleteOrphaned, file.exclude)

				await git.add(file.dest)

				// Commit each file separately, if option is set to false commit all files at once later
				if (COMMIT_EACH_FILE === true) {
					const hasChanges = await git.hasChanges()

					if (hasChanges === false) return core.debug('File(s) already up to date')

					core.debug(`Creating commit for file(s) ${ file.dest }`)

					// Use different commit/pr message based on if the source is a directory or file
					const directory = isDirectory ? 'directory' : ''
					const otherFiles = isDirectory ? 'and copied all sub files/folders' : ''
					const useOriginalCommitMessage = ORIGINAL_MESSAGE && git.isOneCommitPush() && arrayEquals(await git.getChangesFromLastCommit(file.source), await git.changes(file.dest))

					const message = {
						true: {
							commit: useOriginalCommitMessage ? git.originalCommitMessage() : `${ COMMIT_PREFIX } Synced local '${ file.dest }' with remote '${ file.source }'`,
							pr: `Synced local ${ directory } <code>${ file.dest }</code> with remote ${ directory } <code>${ file.source }</code>`
						},
						false: {
							commit: useOriginalCommitMessage ? git.originalCommitMessage() : `${ COMMIT_PREFIX } Created local '${ file.dest }' from remote '${ file.source }'`,
							pr: `Created local ${ directory } <code>${ file.dest }</code> ${ otherFiles } from remote ${ directory } <code>${ file.source }</code>`
						}
					}

					// Commit and add file to modified array so we later know if there are any changes to actually push
					await git.commit(message[destExists].commit)
					modified.push({
						dest: file.dest,
						source: file.source,
						message: message[destExists].pr,
						useOriginalMessage: useOriginalCommitMessage,
						commitMessage: message[destExists].commit
					})
				}
			})

			if (DRY_RUN) {
				core.warning('Dry run, no changes will be pushed')

				core.debug('Git Status:')
				core.debug(await git.status())

				return
			}

			const hasChanges = await git.hasChanges()

			// If no changes left and nothing was modified we can assume nothing has changed/needs to be pushed
			if (hasChanges === false && modified.length < 1) {
				core.info('File(s) already up to date')

				if (existingPr) await git.removePrWarning()

				return
			}

			// If there are still local changes left (i.e. not committed each file separately), commit them before pushing
			if (hasChanges === true) {
				core.debug(`Creating commit for remaining files`)

				let useOriginalCommitMessage = ORIGINAL_MESSAGE && git.isOneCommitPush()
				if (useOriginalCommitMessage) {
					await forEach(item.files, async (file) => {
						useOriginalCommitMessage = useOriginalCommitMessage && arrayEquals(await git.getChangesFromLastCommit(file.source), await git.changes(file.dest))
					})
				}

				const commitMessage = useOriginalCommitMessage ? git.originalCommitMessage() : undefined
				await git.commit(commitMessage)
				modified.push({
					dest: git.workingDir,
					useOriginalMessage: useOriginalCommitMessage,
					commitMessage: commitMessage
				})
			}

			core.info(`Pushing changes to target repository`)
			await git.push()

			if (SKIP_PR === false) {
				// If each file was committed separately, list them in the PR description
				const changedFiles = dedent(`
					<details>
					<summary>Changed files</summary>
					<ul>
					${ modified.map((file) => `<li>${ file.message }</li>`).join('') }
					</ul>
					</details>
				`)

				const useCommitAsPRTitle = COMMIT_AS_PR_TITLE && modified.length === 1 && modified[0].useOriginalMessage
				const pullRequest = await git.createOrUpdatePr(COMMIT_EACH_FILE ? changedFiles : '', useCommitAsPRTitle ? modified[0].commitMessage.split('\n', 1)[0].trim() : undefined)

				core.notice(`Pull Request #${ pullRequest.number } created/updated: ${ pullRequest.html_url }`)
				prUrls.push(pullRequest.html_url)

				if (PR_LABELS !== undefined && PR_LABELS.length > 0 && !FORK) {
					core.info(`Adding label(s) "${ PR_LABELS.join(', ') }" to PR`)
					await git.addPrLabels(PR_LABELS)
				}

				if (ASSIGNEES !== undefined && ASSIGNEES.length > 0 && !FORK) {
					core.info(`Adding assignee(s) "${ ASSIGNEES.join(', ') }" to PR`)
					await git.addPrAssignees(ASSIGNEES)
				}

				if (REVIEWERS !== undefined && REVIEWERS.length > 0 && !FORK) {
					core.info(`Adding reviewer(s) "${ REVIEWERS.join(', ') }" to PR`)
					await git.addPrReviewers(REVIEWERS)
				}

				if (TEAM_REVIEWERS !== undefined && TEAM_REVIEWERS.length > 0 && !FORK) {
					core.info(`Adding team reviewer(s) "${ TEAM_REVIEWERS.join(', ') }" to PR`)
					await git.addPrTeamReviewers(TEAM_REVIEWERS)
				}
			}

			core.info('	')
		} catch (err) {
			core.setFailed(err.message)
			core.debug(err)
		}
	})

	// If we created any PRs, set their URLs as the output
	if (prUrls) {
		core.setOutput('pull_request_urls', prUrls)
	}

	if (SKIP_CLEANUP === true) {
		core.info('Skipping cleanup')
		return
	}

	await remove(TMP_DIR)
	core.info('Cleanup complete')
}

run()
	.then(() => {})
	.catch((err) => {
		core.setFailed(err.message)
		core.debug(err)
	})
})();

module.exports = __webpack_exports__;
/******/ })()
;