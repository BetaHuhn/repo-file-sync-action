const fs = require('fs-extra')
const readfiles = require('node-readfiles')
const { exec } = require('child_process')
const core = require('@actions/core')
const path = require('path')

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

		if (exclude !== undefined && exclude.includes(file)) {
			core.debug(`Excluding file ${ file }`)
			return false
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