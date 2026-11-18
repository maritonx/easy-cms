// Builds the fixture in its own process (from dist: `test` runs after `build`): Vite inside the
// test runner doesn't write files.
import { buildAdmin } from '../dist/index.js'

const [cwd, out] = process.argv.slice(2)
const built = await buildAdmin({ cwd, out })
process.stdout.write(JSON.stringify(built))
