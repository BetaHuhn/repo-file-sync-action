import { lstat, outputFile, copy as _copy, remove as _remove } from 'fs-extra'
import readfiles from 'node-readfiles'
import { exec } from 'child_process'
import { debug } from '@actions/core'
import { join } from 'path'
import { configure, render } from 'nunjucks'

configure({ autoescape: true, trimBlocks: true, lstripBlocks: true })

// From https://github.com/toniov/p-iteration/blob/master/lib/static-methods.js - MIT © Antonio V
export async function forEach(array, callback) {
	for (let index = 0; index < array.length; index++) {
		// eslint-disable-next-line callback-return
		await callback(array[index], index, array)
	}
}

// From https://github.com/MartinKolarik/dedent-js/blob/master/src/index.ts - MIT © 2015 Martin Kolárik
export function dedent(templateStrings, ...values) {
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

export function execCmd(command, workingDir, trimResult = true) {
	debug(`EXEC: "${ command }" IN ${ workingDir }`)
	return new Promise((resolve, reject) => {
		exec(
			command,
			{
				cwd: workingDir,
				maxBuffer: 1024 * 1024 * 4
			},
			function(error, stdout) {
				error ? reject(error) : resolve(
					trimResult ? stdout.trim() : stdout
				)
			}
		)
	})
}

export function addTrailingSlash(str) {
	return str.endsWith('/') ? str : str + '/'
}

export async function pathIsDirectory(path) {
	const stat = await lstat(path)
	return stat.isDirectory()
}

export async function write(src, dest, context) {
	if (typeof context !== 'object') {
		context = {}
	}
	const content = render(src, context)
	await outputFile(dest, content)
}

export async function copy(src, dest, isDirectory, file) {
	const deleteOrphaned = isDirectory && file.deleteOrphaned

	const filterFunc = (file) => {
		if (file.exclude !== undefined && file.exclude.includes(file)) {
			debug(`Excluding file ${ file }`)
			return false
		}

		return true
	}

	if (file.template) {
		if (isDirectory) {
			debug(`Render all files in directory ${ src } to ${ dest }`)

			const srcFileList = await readfiles(src, { readContents: false, hidden: true })
			for (const srcFile of srcFileList) {
				if (!filterFunc(srcFile)) { continue }

				const srcPath = join(src, srcFile)
				const destPath = join(dest, srcFile)
				await write(srcPath, destPath, file.template)
			}
		} else {
			debug(`Render file ${ src } to ${ dest }`)

			await write(src, dest, file.template)
		}
	} else {
		debug(`Copy ${ src } to ${ dest }`)
		await _copy(src, dest, file.exclude !== undefined && { filter: filterFunc })
	}


	// If it is a directory and deleteOrphaned is enabled - check if there are any files that were removed from source dir and remove them in destination dir
	if (deleteOrphaned) {

		const srcFileList = await readfiles(src, { readContents: false, hidden: true })
		const destFileList = await readfiles(dest, { readContents: false, hidden: true })

		for (const destFile of destFileList) {
			if (destFile.startsWith('.git'))
				return
			if (srcFileList.indexOf(destFile) === -1) {
				const filePath = join(dest, destFile)
				debug(`Found an orphaned file in the target repo - ${ filePath }`)

				if (file.exclude !== undefined && file.exclude.includes(join(src, destFile))) {
					debug(`Excluding file ${ destFile }`)
				} else {
					debug(`Removing file ${ destFile }`)
					await _remove(filePath)
				}
			}
		}
	}
}

export async function remove(src) {

	debug(`RM: ${ src }`)

	return _remove(src)
}

export function arrayEquals(array1, array2) {
	return Array.isArray(array1) && Array.isArray(array2) && array1.length === array2.length && array1.every((value, i) => value === array2[i])
}