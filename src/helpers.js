const fs = require('fs-extra')
const { exec } = require('child_process')
const core = require('@actions/core')

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

const addTrailingSlash = (str) => str.endsWith('/') ? str : str + '/'

const pathIsDirectory = async (path) => {
	const stat = await fs.lstat(path)
	return stat.isDirectory()
}

const copy = async (src, dest, exclude) => {

	core.debug(`CP: ${ src } TO ${ dest }`)

	const filterFunc = (file) => {

		if (exclude.includes(file)) {
			core.debug(`Excluding file ${ file }`)
			return false
		}

		return true
	}

	return fs.copy(src, dest, (exclude !== undefined && { filter: filterFunc }))
}

const remove = async (src) => {

	core.debug(`RM: ${ src }`)

	return fs.remove(src)
}

module.exports = {
	forEach,
	dedent,
	addTrailingSlash,
	pathIsDirectory,
	execCmd,
	copy,
	remove
}