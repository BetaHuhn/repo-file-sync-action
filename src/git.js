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
	GITHUB_REPOSITORY
} = require('./config')

const init = (repo) => {

	const localPath = path.join(TMP_DIR, repo.fullName)
	const gitUrl = `https://${ GITHUB_TOKEN }@github.com/${ repo.fullName }.git`

	const clone = () => {
		core.info(`Cloning ${ repo.fullName } into ${ localPath }`)

		return execCmd(
			`git clone --depth 1 ${ repo.branch !== 'default' ? '--branch "' + repo.branch + '"' : '' } ${ gitUrl } ${ localPath }`
		)
	}

	const setIdentity = async (client) => {
		let username = GIT_USERNAME
		let email = GIT_EMAIL

		if (email === undefined) {
			const { data } = await client.users.getAuthenticated()
			email = data.email
			username = data.login
		}

		core.info(`Setting git user to email: ${ email }, username: ${ username }`)

		return execCmd(
			`git config --local user.name "${ username }" && git config --local user.email "${ email }"`,
			localPath
		)
	}

	const currentBranch = async () => {
		return execCmd(
			`git rev-parse --abbrev-ref HEAD`,
			localPath
		)
	}

	const createPrBranch = async () => {
		return new Promise((resolve, reject) => {
			const timestamp = Math.round((new Date()).getTime() / 1000)
			const newBranch = `file-sync/${ repo.branch }-${ timestamp }`

			core.info(`Creating PR Branch ${ newBranch }`)

			execCmd(
				`git checkout -b "${ newBranch }"`,
				localPath
			).catch((err) => {
				reject(err)
			}).then(() => {
				resolve(newBranch)
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

	const commit = async (dest, source) => {
		const message = dest !== undefined ? `${ COMMIT_PREFIX } Resynced '${ dest }' with '${ GITHUB_REPOSITORY }/${ source }'` : `${ COMMIT_PREFIX } Resynced file(s) with ${ GITHUB_REPOSITORY }`
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

	const push = async () => {
		return execCmd(
			`git push ${ gitUrl }`,
			localPath
		)
	}

	return {
		localPath,
		clone,
		setIdentity,
		createPrBranch,
		add,
		hasChange,
		commit,
		status,
		push,
		currentBranch
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