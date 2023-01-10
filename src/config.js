import * as core from '@actions/core'
import * as yaml from 'js-yaml'
import * as fs from 'fs-extra'
import * as path from 'path'
import { getInput } from 'action-input-parser'

const REPLACE_DEFAULT = true
const TEMPLATE_DEFAULT = false
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
		GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL || 'https://github.com',
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
		IS_FINE_GRAINED: getInput({
			key: 'IS_FINE_GRAINED',
			default: false
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
	let host = new URL(context.GITHUB_SERVER_URL).host

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
		if (typeof item === 'string')
			item = { source: item }

		if (item.source !== undefined) {
			return {
				source: item.source,
				dest: item.dest || item.source,
				template: item.template === undefined ? TEMPLATE_DEFAULT : item.template,
				replace: item.replace === undefined ? REPLACE_DEFAULT : item.replace,
				deleteOrphaned: item.deleteOrphaned === undefined ? DELETE_ORPHANED_DEFAULT : item.deleteOrphaned,
				exclude: parseExclude(item.exclude, item.source)
			}
		}

		core.warning('Warn: No source files specified')
	})
}

export async function parseConfig() {
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

export default context