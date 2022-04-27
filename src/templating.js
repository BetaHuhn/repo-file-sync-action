
const path = require('path')
const fs = require('fs-extra')
const readfiles = require('node-readfiles')
const core = require('@actions/core')
const mustache = require('mustache')
const yaml = require('js-yaml')

const { pathIsDirectory, addTrailingSlash } = require('./helpers')

const generateTemplate = async (src, repoName) => {
	let content = await fs.readFile(src, 'utf-8')
	const isTemplateFile = content.startsWith('{{=<% %>=}}')
	if (isTemplateFile) {
		core.info(`Found mustache template ${ src }`)
		const templateValuesPath = `${ src }.${ repoName }.values.yml`
		if (fs.existsSync(templateValuesPath)) {
			core.info(`CP: templated values file ${ templateValuesPath } exist`)
			const templateValues = yaml.load((await fs.promises.readFile(templateValuesPath)))
			if (templateValues === undefined) {
				const errMessage = `Template values not found in ${ templateValuesPath }. maybe missing exports.values ?`
				core.error(errMessage)
				core.setFailed(errMessage)
				return
			}
			core.info(`templating src ${ src } with ${ JSON.stringify(templateValues) }`)
			content = mustache.render(content, {}, templateValues)
		} else {
			core.info(`CP: templated values file ${ templateValuesPath } doesn't exist`)
			content = mustache.render(content, {}, {})
		}
		const [ dir, name, etx ] = [ path.dirname(src), path.basename(src), path.extname(src) ]
		const destination = `${ dir }/${ name }.generated-${ repoName }.${ etx }`
		await fs.writeFile(destination, content, 'utf-8')
		return { isTemplateFile, destination }
	}
	return { isTemplateFile }
}

const addToExclude = (file, toExclude) => Array.isArray(file.exclude) ? [ ...file.exclude, toExclude ] : [ toExclude ]

const generateTemplatesAndUpdateFiles = async (files, repoName) => {
	for (const file of files) {
		const isDirectory = await pathIsDirectory(file.source)
		const source = isDirectory ? `${ addTrailingSlash(file.source) }` : file.source

		if (isDirectory) {
			const srcFileList = await readfiles(source, { readContents: false, hidden: true })
			await Promise.all(
				srcFileList.map(async (srcFile) => {
					const srcFilePath = `${ file.source }/${ srcFile }`
					const { isTemplateFile } = await generateTemplate(srcFilePath, repoName)
					if (isTemplateFile) {
						file.exclude = addToExclude(file, srcFilePath)
					}
				})
			)
		} else {
			const { isTemplateFile, destination } = await generateTemplate(source, repoName)
			if (isTemplateFile) {
				file.source = destination
			}
		}
	}
}

module.exports = {
	generateTemplatesAndUpdateFiles
}