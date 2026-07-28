// packages/cli/src/commands/init.ts
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'

export interface RunInitOptions {
  cwd: string
  prompt?: (question: string) => Promise<string>
}

async function defaultPrompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}

export async function runInit(opts: RunInitOptions): Promise<void> {
  const prompt = opts.prompt ?? defaultPrompt
  const tableName = await prompt('Table name to sync: ')

  const yaml = `port: 3000\nallowed_origin: "*"\ntable:\n  name: ${tableName}\n`
  await writeFile(path.join(opts.cwd, 'datum.yaml'), yaml, 'utf-8')
}
