const core = require('@actions/core')
const yaml = require('js-yaml')
const fs = require('fs')

require('dotenv').config()

const REPLACE_DEFAULT = true

const getVar = ({ key, default: dft, required = false, type = 'string' }) => {
	const coreVar = core.getInput(key)
	const envVar = process.env[key]

	if (key === 'PR_LABELS' && (coreVar === false || envVar === 'false'))
		return undefined

	if (coreVar !== undefined && coreVar.length >= 1) {
		if (type === 'array') return coreVar.split('\n')
		if (type === 'boolean') return coreVar === 'false' ? false : Boolean(coreVar)

		return coreVar
	}

	if (envVar !== undefined && envVar.length >= 1) {
		if (type === 'array') return envVar.split(',')
		if (type === 'boolean') return envVar === 'true'

		return envVar
	}

	if (required === true)
		return core.setFailed(`Variable ${ key } missing.`)

	return dft

}

const context = {
	GITHUB_TOKEN: getVar({
		key: 'GH_PAT',
		required: true
	}),
	GIT_EMAIL: getVar({
		key: 'GIT_EMAIL'
	}),
	GIT_USERNAME: getVar({
		key: 'GIT_USERNAME'
	}),
	CONFIG_PATH: getVar({
		key: 'CONFIG_PATH',
		default: '.github/sync.yml'
	}),
	COMMIT_PREFIX: getVar({
		key: 'COMMIT_PREFIX',
		default: '🔄'
	}),
	COMMIT_EACH_FILE: getVar({
		key: 'COMMIT_EACH_FILE',
		type: 'boolean',
		default: true
	}),
	PR_LABELS: getVar({
		key: 'PR_LABELS',
		default: [ 'sync' ],
		type: 'array'
	}),
	ASSIGNEES: getVar({
		key: 'ASSIGNEES',
		type: 'array'
	}),
	TMP_DIR: getVar({
		key: 'TMP_DIR',
		default: `tmp-${ Date.now().toString() }`
	}),
	DRY_RUN: getVar({
		key: 'DRY_RUN',
		type: 'boolean',
		default: false
	}),
	SKIP_CLEANUP: getVar({
		key: 'SKIP_CLEANUP',
		type: 'boolean',
		default: false
	}),
	OVERWRITE_EXISTING_PR: getVar({
		key: 'OVERWRITE_EXISTING_PR',
		type: 'boolean',
		default: true
	}),
	GITHUB_REPOSITORY: getVar({
		key: 'GITHUB_REPOSITORY',
		required: true
	})
}

core.setSecret(context.GITHUB_TOKEN)

core.debug(JSON.stringify(context, null, 2))

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
	const branch = fullRepo.split('/')[1].split('@')[1] || 'default'

	return {
		fullName: `${ host }/${ user }/${ name }`,
		host,
		user,
		name,
		branch
	}
}


const parseFiles = (files) => {
	return files.map((item) => {

		if (typeof item === 'string') {
			return {
				source: item,
				dest: item,
				replace: REPLACE_DEFAULT
			}
		}

		if (item.source !== undefined) {
			return {
				source: item.source,
				dest: item.dest !== undefined ? item.dest : item.source,
				replace: item.replace !== undefined ? item.replace : REPLACE_DEFAULT
			}
		}

		core.warn('Warn: No source files specified')
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
				const repos = typeof group.repos === 'string' ? group.repos.split('\n').filter((n) => n) : group.repos

				repos.forEach((name) => {
					const files = parseFiles(group.files)
					const repo = parseRepoName(name)

					if (result[repo.fullName] !== undefined) {
						result[repo.fullName].files.push(...files)
						return
					}

					result[repo.fullName] = {
						repo,
						files
					}
				})
			})
		} else {
			const files = parseFiles(configObject[key])
			const repo = parseRepoName(key)

			if (result[repo.fullName] !== undefined) {
				result[repo.fullName].files.push(...files)
				return
			}

			result[repo.fullName] = {
				repo,
				files
			}
		}
	})

	return Object.values(result)
}

while (fs.existsSync(context.TMP_DIR)) {
	context.TMP_DIR = `tmp-${ Date.now().toString() }`
	core.warn(`TEMP_DIR already exists. Using "${ context.TMP_DIR }" now.`)
}

module.exports = {
	...context,
	parseConfig
}