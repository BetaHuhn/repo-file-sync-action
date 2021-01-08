const core = require('@actions/core')
const yaml = require('js-yaml')
const fs = require('fs')

require('dotenv').config()

const REPLACE_DEFAULT = true

const getVar = ({ key, default: dft, required = false, array = false }) => {
	const coreVar = core.getInput(key)
	const envVar = process.env[key]

	if (required === false && (coreVar === false || envVar === 'false'))
		return undefined

	if (coreVar !== undefined && coreVar.length >= 1)
		return array ? coreVar.split('\n') : coreVar

	if (envVar !== undefined && envVar.length >= 1)
		return array ? envVar.split(',') : envVar

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
		default: true
	}),
	PR_LABELS: getVar({
		key: 'PR_LABELS',
		default: [ 'sync' ],
		required: false,
		array: true
	}),
	ASSIGNEES: getVar({
		key: 'ASSIGNEES',
		required: false,
		array: true
	}),
	TMP_DIR: getVar({
		key: 'TMP_DIR',
		default: `tmp-${ Date.now().toString() }`
	}),
	DRY_RUN: getVar({
		key: 'DRY_RUN',
		default: false
	}),
	GITHUB_REPOSITORY: getVar({
		key: 'GITHUB_REPOSITORY',
		required: true
	})
}

core.setSecret(context.GITHUB_TOKEN)

core.debug(
	JSON.stringify(
		context,
		null,
		2
	)
)

const parseRepoName = (fullRepo) => {
	const user = fullRepo.split('/')[0]
	const name = fullRepo.split('/')[1].split('@')[0]
	const branch = fullRepo.split('/')[1].split('@')[1] || 'default'

	return {
		fullName: `${ user }/${ name }`,
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

		core.wanr('Warn: No source files specified')
	})
}

const parseConfig = async () => {
	const fileContent = await fs.promises.readFile(context.CONFIG_PATH)

	const configObject = yaml.load(fileContent.toString())

	const result = []

	Object.keys(configObject).forEach((key) => {
		if (key === 'group') {
			const object = configObject[key]
			const repos = typeof object.repos === 'string' ? object.repos.split('\n').filter((n) => n) : object.repos

			repos.forEach((name) => {
				const files = parseFiles(object.files)
				result.push({
					repo: parseRepoName(name),
					files
				})
			})
		} else {
			const files = parseFiles(configObject[key])
			result.push({
				repo: parseRepoName(key),
				files
			})
		}
	})

	return result
}

while (fs.existsSync(context.TMP_DIR)) {
	context.TMP_DIR = `tmp-${ Date.now().toString() }`
	core.warn(`TEMP_DIR already exists. Using "${ context.TMP_DIR }" now.`)
}

module.exports = {
	...context,
	parseConfig
}