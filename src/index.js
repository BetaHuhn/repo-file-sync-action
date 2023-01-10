import * as core from '@actions/core'
import * as fs from 'fs'

import Git from './git.js'
import { forEach, dedent, addTrailingSlash, pathIsDirectory, copy, remove, arrayEquals } from './helpers.js'

import { parseConfig, default as config } from './config.js'

const {
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
} = config

async function run() {
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

				await copy(source, dest, isDirectory, file)

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
							commit: useOriginalCommitMessage ? git.originalCommitMessage() : `${ COMMIT_PREFIX } synced local '${ file.dest }' with remote '${ file.source }'`,
							pr: `synced local ${ directory } <code>${ file.dest }</code> with remote ${ directory } <code>${ file.source }</code>`
						},
						false: {
							commit: useOriginalCommitMessage ? git.originalCommitMessage() : `${ COMMIT_PREFIX } created local '${ file.dest }' from remote '${ file.source }'`,
							pr: `created local ${ directory } <code>${ file.dest }</code> ${ otherFiles } from remote ${ directory } <code>${ file.source }</code>`
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
	.catch((err) => {
		core.setFailed(err.message)
		core.debug(err)
	})