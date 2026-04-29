// Runs the archetype classifier against the labeled bank and prints a
// summary report. Compares to the previous run if one exists.
//
// Usage:
//   npm run eval:classifier
//
// Requires GEMINI_API_KEY in the environment (.env is loaded automatically
// by the npm script via tsx --env-file=.env).

import {
  diffRuns,
  formatReport,
  loadLastRun,
  runEval,
  saveLastRun,
} from '../server/lib/__evals__/runArchetypeEval.ts'

async function main() {
  const prev = await loadLastRun()

  process.stdout.write('Running classifier eval...')
  const run = await runEval({
    concurrency: 8,
    onProgress: (done, total) => {
      process.stdout.write(`\rRunning classifier eval... ${done}/${total}`)
    },
  })
  process.stdout.write('\n')

  const diff = prev ? diffRuns(prev, run) : null
  console.log(formatReport(run, diff))

  await saveLastRun(run)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
