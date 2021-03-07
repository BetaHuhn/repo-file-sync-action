const core = require('@actions/core')
const github = require('@actions/github')
const io = require('@actions/io')
const fs = require('fs')

const Git = require('./git')
const { forEach, dedent, addTrailingSlash, pathIsDirectory } = require('./helpers')

const {
	parseConfig,
	GITHUB_TOKEN,
	COMMIT_EACH_FILE,
	COMMIT_PREFIX,
	PR_LABELS,
	ASSIGNEES,
	DRY_RUN,
	TMP_DIR,
	SKIP_CLEANUP,
	OVERWRITE_EXISTING_PR
} = require('./config')

const run = async () => {
	const client = new github.GitHub(GITHUB_TOKEN)

	const repos = await parseConfig()

	await forEach(repos, async (item) => {
		core.info(`Repository Info`)
		core.info(`Slug		: ${ item.repo.name }`)
		core.info(`Owner		: ${ item.repo.user }`)
		core.info(`Https Url	: https://${ item.repo.fullName }`)
		core.info(`Branch		: ${ item.repo.branch }`)
		core.info('	')
		try {
			const git = Git.init(item.repo)

			// Clone and setup the git repository locally
			await git.clone()
			await git.setIdentity(client)
			await git.getBaseBranch()
			await git.createPrBranch()

			// Check for existing PR and add warning message that the PR maybe about to change
			const existingPr = OVERWRITE_EXISTING_PR && await git.findExistingPr()
			if (existingPr && DRY_RUN === false) {
				core.info(`Found existing PR ${ existingPr.number }`)
				await git.setPrWarning()
			}

			const modified = []

			// Loop through all selected files of the source repo
			await forEach(item.files, async (file) => {
				core.info(`Looking for changed files`)

				const fileExists = fs.existsSync(file.source)
				if (fileExists === false) return core.warning(`Source ${ file.source } not found`)

				const localDestination = `${ git.workingDir }/${ file.dest }`

				const destExists = fs.existsSync(localDestination)
				if (destExists === true && file.replace === false) return core.warning(`File(s) already exist(s) in destination and 'replace' option is set to false`)

				const isDirectory = await pathIsDirectory(file.source)
				const source = isDirectory ? `${ addTrailingSlash(file.source) }` : file.source

				if (isDirectory) core.warning(`Source is directory`)

				core.debug(`Copying ${ source } to ${ localDestination }`)
				await io.cp(source, localDestination, { recursive: true, force: true })

				await git.add(file.dest)

				// Commit each file seperately, if option is set to false, commit all files at once later
				if (COMMIT_EACH_FILE === true) {
					const hasChanges = await git.hasChanges()

					if (hasChanges === false) return core.debug('File(s) already up to date')

					core.debug(`Creating commit for file(s) ${ file.dest }`)

					// Use different commit/pr message based on if the source is a directory or file
					const directory = isDirectory ? 'directory' : ''
					const otherFiles = isDirectory ? 'and copied all sub files/folders' : ''

					const message = {
						true: {
							commit: `${ COMMIT_PREFIX } Synced local '${ file.dest }' with remote '${ file.source }'`,
							pr: `Synced local ${ directory } <code>${ file.dest }</code> with remote ${ directory } <code>${ file.source }</code>`
						},
						false: {
							commit: `${ COMMIT_PREFIX } Created local '${ file.dest }' from remote '${ file.source }'`,
							pr: `Created local ${ directory } <code>${ file.dest }</code> ${ otherFiles } from remote ${ directory } <code>${ file.source }</code>`
						}
					}

					// Commit and add file to modified array so we later know if there are any changes to actually push
					await git.commit(message[destExists].commit)
					modified.push({
						dest: file.dest,
						source: file.source,
						message: message[destExists].pr
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

			// If there are still local changes left (i.e. not committed each file seperately), commit them before pushing
			if (hasChanges === true) {
				core.debug(`Creating commit for remaining files`)

				await git.commit()
				modified.push({
					dest: git.workingDir
				})
			}

			core.info(`Pushing changes to target repository`)
			await git.push()

			// If each file was committed seperately, list them in the PR description
			const changedFiles = dedent(`
				<details>
				<summary>Changed files</summary>
				<ul>
				${ modified.map((file) => `<li>${ file.message }</li>`).join() }
				</ul>
				</details>
			`)

			const pullRequest = await git.createOrUpdatePr(COMMIT_EACH_FILE ? changedFiles : '')

			core.info(`Pull Request #${ pullRequest.number } created/updated: ${ pullRequest.html_url }`)

			core.setOutput('pull_request_number', pullRequest.number)
			core.setOutput('pull_request_url', pullRequest.html_url)

			if (PR_LABELS !== undefined && PR_LABELS.length > 0) {
				core.info(`Adding label(s) "${ PR_LABELS.join(', ') }" to PR`)
				await client.issues.addLabels({
					owner: item.repo.user,
					repo: item.repo.name,
					issue_number: pullRequest.number,
					labels: PR_LABELS
				})
			}

			if (ASSIGNEES !== undefined && ASSIGNEES.length > 0) {
				core.info(`Adding assignee(s) "${ ASSIGNEES.join(', ') }" to PR`)
				await client.issues.addAssignees({
					owner: item.repo.user,
					repo: item.repo.name,
					issue_number: pullRequest.number,
					assignees: ASSIGNEES
				})
			}

			core.info('	')
		} catch (err) {
			core.error(err.message)
			core.error(err)
		}
	})

	if (SKIP_CLEANUP === true) {
		core.info('Skipping cleanup')
		return
	}

	await io.rmRF(TMP_DIR)
	core.info('Cleanup complete')
}

run()
	.then(() => {})
	.catch((err) => {
		core.error('ERROR', err)
		core.setFailed(err.message)
	})