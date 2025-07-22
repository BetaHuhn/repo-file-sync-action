import fs from 'fs-extra'
import readfiles from 'node-readfiles'
import { exec } from 'child_process'
import * as core from '@actions/core'
import * as path from 'path'
import nunjucks from 'nunjucks'

nunjucks.configure({ autoescape: true, trimBlocks: true, lstripBlocks: true })

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
	core.debug(`EXEC: "${ command }" IN ${ workingDir }`)
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
	const stat = await fs.lstat(path)
	return stat.isDirectory()
}

export async function write(src, dest, context) {
	if (typeof context !== 'object') {
		context = {}
	}
	const content = nunjucks.render(src, context)
	await fs.outputFile(dest, content)
}

export async function copy(src, dest, isDirectory, file) {
	const deleteOrphaned = isDirectory && file.deleteOrphaned
	const exclude = file.exclude

	const filterFunc = (srcFile, destFile) => {
		core.debug(`Filtering file ${ srcFile } to ${ destFile }`)
		if (file.replace === false) {
			// Directories are always copied
			try {
				if (fs.lstatSync(destFile).isDirectory()) {
					core.debug(`Dest File ${ destFile } already exists and is a directory`)
					return true
				}
			} catch (error) {
				core.debug(`Destination file or directory ${ destFile } does not exist`)
				return true
			}

			if (fs.existsSync(destFile)) {
				core.debug(`File ${ destFile } already exists and 'replace' option is set to false`)
				return false
			}
		}

		if (exclude !== undefined) {

			// Check if file-path is one of the present filepaths in the excluded paths
			// This has presedence over the single file, and therefore returns before the single file check
			let filePath = ''
			if (srcFile.endsWith('/')) {
				// File item is a folder
				filePath = srcFile
			} else {
				// File item is a file
				filePath = srcFile.split('\/').slice(0, -1).join('/') + '/'
			}

			if (exclude.includes(filePath)) {
				core.debug(`Excluding file ${ srcFile } since its path is included as one of the excluded paths.`)
				return false
			}


			// Or if the file itself is in the excluded files
			if (exclude.includes(srcFile)) {
				core.debug(`Excluding file ${ srcFile } since it is explicitly added in the exclusion list.`)
				return false
			}
		}

		// Check if the file matches any of the excludeFilePatterns
		if (file.excludeFilePatterns.length > 0) {
			for (const pattern of file.excludeFilePatterns) {
				if (srcFile.match(pattern)) {
					core.debug(`Excluding file ${ srcFile } since it matches the excludeFilePattern ${ pattern }.`)
					return false
				}
			}
		}

		// Check if the file matches any of the includeFilePatterns
		if (file.includeFilePatterns.length > 0) {
			let matches = false
			for (const pattern of file.includeFilePatterns) {
				if (srcFile.match(pattern)) {
					matches = true
					break
				}
			}

			if (!matches) {
				core.debug(`Excluding file ${ srcFile } since it does not match any of the includeFilePatterns.`)
				return false
			}
		}
		return true
	}

	if (file.template) {
		if (isDirectory) {
			core.debug(`Render all files in directory ${ src } to ${ dest }`)

			const srcFileList = await readfiles(src, { readContents: false, hidden: true })
			for (const srcFile of srcFileList) {
				if (!filterFunc(srcFile)) { continue }

				const srcPath = path.join(src, srcFile)
				const destPath = path.join(dest, srcFile)
				await write(srcPath, destPath, file.template)
			}
		} else {
			core.debug(`Render file ${ src } to ${ dest }`)

			await write(src, dest, file.template)
		}
	} else {
		core.debug(`Copy ${ src } to ${ dest }`)
		await fs.copy(src, dest,{ filter: filterFunc })
	}


	// If it is a directory and deleteOrphaned is enabled - check if there are any files that were removed from source dir and remove them in destination dir
	if (deleteOrphaned) {

		const srcFileList = await readfiles(src, { readContents: false, hidden: true })
		const destFileList = await readfiles(dest, { readContents: false, hidden: true })

		for (const destFile of destFileList) {
			if (destFile.startsWith('.git')) return
			if (srcFileList.indexOf(destFile) === -1) {
				const filePath = path.join(dest, destFile)
				core.debug(`Found an orphaned file in the target repo - ${ filePath }`)

				if (file.exclude !== undefined && file.exclude.includes(path.join(src, destFile))) {
					core.debug(`Excluding file ${ destFile }`)
				} else {
					core.debug(`Removing file ${ destFile }`)
					await fs.remove(filePath)
				}
			}
		}
	}
}

export async function remove(src) {

	core.debug(`RM: ${ src }`)

	return fs.remove(src)
}

export function arrayEquals(array1, array2) {
	return Array.isArray(array1) && Array.isArray(array2) && array1.length === array2.length && array1.every((value, i) => value === array2[i])
}