const { exec } = require('child_process')
const { parse } = require('@putout/git-status-porcelain')
const core = require('@actions/core')
const path = require('path')

const {
	GITHUB_TOKEN,
	GIT_USERNAME,
	GIT_EMAIL,
	TMP_DIR,
	COMMIT_PREFIX,
	GITHUB_REPOSITORY,
	OVERWRITE_EXISTING_PR
} = require('./config')
const { dedent } = require('./helpers')


const init = (repo) => {

	let github
	let baseBranch
	let prBranch
	let existingPr

	const localPath = path.join(TMP_DIR, repo.fullName)
	const gitUrl = `https://${ GITHUB_TOKEN }@${ repo.fullName }.git`

	const clone = () => {
		core.info(`Cloning ${ repo.fullName } into ${ localPath }`)

		return execCmd(
			`git clone --depth 1 ${ repo.branch !== 'default' ? '--branch "' + repo.branch + '"' : '' } ${ gitUrl } ${ localPath }`
		)
	}

	const setIdentity = async (client) => {
		let username = GIT_USERNAME
		let email = GIT_EMAIL
		github = client

		if (email === undefined) {
			const { data } = await github.users.getAuthenticated()
			email = data.email
			username = data.login
		}

		core.info(`Setting git user to email: ${ email }, username: ${ username }`)

		return execCmd(
			`git config --local user.name "${ username }" && git config --local user.email "${ email }"`,
			localPath
		)
	}

	const getBaseBranch = async () => {
		baseBranch = await execCmd(
			`git rev-parse --abbrev-ref HEAD`,
			localPath
		)
	}

	const createPrBranch = async () => {
		return new Promise((resolve, reject) => {
			let newBranch = `repo-sync/${ GITHUB_REPOSITORY.split('/')[1] }/${ repo.branch }`

			if (OVERWRITE_EXISTING_PR === false) {
				newBranch += `-${ Math.round((new Date()).getTime() / 1000) }`
			}

			core.info(`Creating PR Branch ${ newBranch }`)

			execCmd(
				`git checkout -b "${ newBranch }"`,
				localPath
			).catch((err) => {
				reject(err)
			}).then(() => {
				prBranch = newBranch
				resolve()
			})
		})
	}

	const add = async (file) => {
		return execCmd(
			`git add -f ${ file }`,
			localPath
		)
	}

	const hasChange = async () => {
		const statusOutput = await execCmd(
			`git status --porcelain`,
			localPath
		)
		return parse(statusOutput).length !== 0
	}

	const commit = async (msg) => {
		const message = msg !== undefined ? msg : `${ COMMIT_PREFIX } Synced file(s) with ${ GITHUB_REPOSITORY }`
		return execCmd(
			`git commit -m "${ message }"`,
			localPath
		)
	}

	const status = async () => {
		return execCmd(
			`git status`,
			localPath
		)
	}

	const push = async ({ force }) => {
		console.log(force)
		return execCmd(
			`git push ${ gitUrl } ${ force ? '--force' : '' }`,
			localPath
		)
	}

	const findExistingPr = async () => {
		const { data } = await github.pulls.list({
			owner: repo.user,
			repo: repo.name,
			state: 'open',
			head: `${ repo.user }:${ prBranch }`
		})

		existingPr = data[0]

		return existingPr
	}

	const setPrWarning = async () => {
		await github.pulls.update({
			owner: repo.user,
			repo: repo.name,
			pull_number: existingPr.number,
			body: dedent(`
				⚠️ This PR is being automatically resynced ⚠️

				${ existingPr.body }
			`)
		})
	}

	const removePrWarning = async () => {
		await github.pulls.update({
			owner: repo.user,
			repo: repo.name,
			pull_number: existingPr.number,
			body: existingPr.body.replace('⚠️ This PR is being automatically resynced ⚠️', '')
		})
	}

	const createOrUpdatePr = async (changedFiles) => {
		const body = dedent(`
			Synced local file(s) with [${ GITHUB_REPOSITORY }](https://github.com/${ GITHUB_REPOSITORY }).

			${ changedFiles }

			---

			This PR was created automatically by the [repo-file-sync-action](https://github.com/BetaHuhn/repo-file-sync-action) workflow run [#${ process.env.GITHUB_RUN_ID || 0 }](https://github.com/${ GITHUB_REPOSITORY }/actions/runs/${ process.env.GITHUB_RUN_ID || 0 })
		`)

		if (existingPr) {
			core.info(`Overwriting existing PR`)

			const { data } = await github.pulls.update({
				owner: repo.user,
				repo: repo.name,
				pull_number: existingPr.number,
				body: body
			})

			return data
		}

		core.info(`Creating new PR`)

		const { data } = await github.pulls.create({
			owner: repo.user,
			repo: repo.name,
			title: `${ COMMIT_PREFIX } Synced file(s) with ${ GITHUB_REPOSITORY }`,
			body: body,
			head: prBranch,
			base: baseBranch
		})

		return data
	}

	return {
		localPath,
		clone,
		setIdentity,
		getBaseBranch,
		createPrBranch,
		add,
		hasChange,
		commit,
		status,
		push,
		findExistingPr,
		setPrWarning,
		removePrWarning,
		createOrUpdatePr
	}
}

const execCmd = (command, workingDir) => {
	core.debug(`EXEC: "${ command }" IN ${ workingDir }`)
	return new Promise((resolve, reject) => {
		exec(
			command,
			{
				cwd: workingDir
			},
			function(error, stdout) {
				error ? reject(error) : resolve(stdout.trim())
			}
		)
	})
}

module.exports = {
	init
}