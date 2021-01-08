const core = require('@actions/core')
const github = require('@actions/github')
const io = require('@actions/io')
const fs = require('fs')

const Git = require('./git')
const { forEach, dedent } = require('./helpers')

const {
	parseConfig,
	GITHUB_TOKEN,
	COMMIT_EACH_FILE,
	GITHUB_REPOSITORY,
	COMMIT_PREFIX,
	PR_LABELS,
	ASSIGNEES,
	DRY_RUN
} = require('./config')

const run = async () => {
	const client = new github.GitHub(GITHUB_TOKEN)

	const repos = await parseConfig()

	await forEach(repos, async (item) => {
		core.info(`Repository Info`)
		core.info(`Slug		: ${ item.repo.name }`)
		core.info(`Owner		: ${ item.repo.user }`)
		core.info(`Https Url	: https://github.com/${ item.repo.fullName }`)
		core.info(`Branch		: ${ item.repo.branch }`)
		core.info('	')
		try {
			const git = Git.init(item.repo)

			await git.clone()
			await git.setIdentity(client)

			const currentBranch = await git.currentBranch()
			const prBranch = await git.createPrBranch()

			const modified = []

			await forEach(item.files, async (file) => {
				if (file.pattern !== undefined) {
					core.warning('Pattern not supported yet')
					return
				}

				const fileExists = fs.existsSync(file.source)
				if (fileExists === false) {
					core.warning(`Source file ${ file.source } not found`)
					return
				}

				const stat = await fs.promises.lstat(file.source)
				const isFile = stat.isFile()
				if (isFile === false) {
					core.warning(`Directory as source not supported yet`)
					// io.cp(file.source, dest, { recursive: false, force: false })
					return
				}

				const dest = `${ git.localPath }/${ file.dest }`
				const destExists = fs.existsSync(dest)
				if (destExists === true && file.replace === false) {
					core.warning(`File already exists in destination and 'replace' option is set to false`)
					return
				}

				core.info(`Copying ${ file.source } to ${ dest }`)
				await io.cp(file.source, dest, { recursive: false, force: true }).catch((err) => {
					core.error(`Unable to copy file.`)
					core.error(err)
				}).then(async () => {
					await git.add(file.dest)

					if (COMMIT_EACH_FILE === true) {
						const hasChange = await git.hasChange()
						if (hasChange === false) {
							core.info('File already up to date')
							return
						}

						core.info(`Creating commit for file ${ file.dest }`)

						let message
						let prMessage
						if (destExists) {
							message = `${ COMMIT_PREFIX } Synced local '${ file.dest }' with remote '${ file.source }'`
							prMessage = `Synced local <code>${ file.dest }</code> with remote <code>${ file.source }</code>`
						} else {
							message = `${ COMMIT_PREFIX } Created local '${ file.dest }' from remote '${ file.source }'`
							prMessage = `Created local <code>${ file.dest }</code> from remote <code>${ file.source }</code>`
						}

						await git.commit(message)
						modified.push({
							dest: file.dest,
							source: file.source,
							message: prMessage
						})
					}
				})
			})

			if (DRY_RUN) {
				core.warning('Dry run, no changes will be pushed')
				core.info('Git Status')
				core.info(await git.status())
				return
			}

			const hasChange = await git.hasChange()
			if (hasChange === false && COMMIT_EACH_FILE === false) {
				core.info('File(s) already up to date')
				return
			}

			if (hasChange === true) {
				core.info(`Creating commit for remaining files`)
				await git.commit()
				modified.push({
					dest: git.localPath
				})
			}

			if (modified.length < 1) {
				core.info('Nothing to push')
				return
			}

			core.info(`Pushing changes to remote`)
			await git.push()

			let changedFiles = ''
			let list = ``

			if (COMMIT_EACH_FILE === true) {
				modified.forEach((file) => {
					list += `<li>${ file.message }</li>`
				})

				changedFiles = dedent(`
					<details>
					<summary>Changed files</summary>
					<ul>
					${ list }
					</ul>
					</details>
				`)
			}

			core.info(`Creating new PR`)
			const { data } = await client.pulls.create({
				owner: item.repo.user,
				repo: item.repo.name,
				title: `${ COMMIT_PREFIX } Synced file(s) with ${ GITHUB_REPOSITORY }`,
				body: dedent(`
					Synced file(s) with [${ GITHUB_REPOSITORY }](https://github.com/${ GITHUB_REPOSITORY }).

					${ changedFiles }

					---

					This PR was created automatically by the [action-github-file-sync](https://github.com/BetaHuhn/action-github-file-sync) workflow run [#${ process.env.GITHUB_RUN_NUMBER || 0 }](https://github.com/${ GITHUB_REPOSITORY }/actions/runs/${ process.env.GITHUB_RUN_NUMBER || 0 })
				`),
				head: prBranch,
				base: currentBranch
			})

			core.info(`Pull Request Created: #${ data.number }`)
			core.info(`${ data.html_url }`)

			core.setOutput('pull_request_number', data.number)
			core.setOutput('pull_request_url', data.html_url)

			if (PR_LABELS !== undefined && PR_LABELS.length > 0) {
				core.info(`Adding label(s) "${ PR_LABELS.join(', ') }" to PR`)
				await client.issues.addLabels({
					owner: item.repo.user,
					repo: item.repo.name,
					issue_number: data.number,
					labels: PR_LABELS
				})
			}

			if (ASSIGNEES !== undefined && ASSIGNEES.length > 0) {
				core.info(`Adding assignee(s) "${ ASSIGNEES.join(', ') }" to PR`)
				await client.issues.addAssignees({
					owner: item.repo.user,
					repo: item.repo.name,
					issue_number: data.number,
					assignees: ASSIGNEES
				})
			}

			core.info('	')
		} catch (err) {
			core.error(err.message)
			core.error(err)
		}
	})

	core.info('DONE')
}

run()
	.then(() => {})
	.catch((err) => {
		console.error('ERROR', err)
		core.setFailed(err.message)
	})