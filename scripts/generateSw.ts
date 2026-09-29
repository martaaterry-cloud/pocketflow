import { writeServiceWorkerFile, writeVersionJsonFile } from '../src/utils/swGenerator'
import { APP_BUILD, APP_VERSION } from '../src/version'
import * as path from 'node:path'

const publicSwPath = path.resolve(process.cwd(), 'public', 'sw.js')
writeServiceWorkerFile(publicSwPath, APP_VERSION, APP_BUILD)
console.log(`[generateSw] Generated public/sw.js with version: ${APP_VERSION}, build: ${APP_BUILD}`)

const publicVersionPath = path.resolve(process.cwd(), 'public', 'version.json')
writeVersionJsonFile(publicVersionPath, APP_VERSION, APP_BUILD)
console.log(`[generateSw] Generated public/version.json with version: ${APP_VERSION}, build: ${APP_BUILD}`)
