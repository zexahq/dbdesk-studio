import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'

// Atomic replacement protects readers from partial writes. The lock covers the
// entire read/modify/write cycle, including other local Studio processes.
export async function readJsonFile<T>(file: string, empty: () => T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty()
    // Preserve malformed files for recovery instead of overwriting them as empty.
    throw error
  }
}

export async function updateJsonFile<T, R>(
  file: string,
  empty: () => T,
  update: (value: T) => R | Promise<R>
): Promise<R> {
  await fs.mkdir(dirname(file), { recursive: true, mode: 0o700 })
  const lockPath = `${file}.lock`
  const deadline = Date.now() + 10000
  let lock: Awaited<ReturnType<typeof fs.open>>
  while (true) {
    try {
      lock = await fs.open(lockPath, 'wx', 0o600)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (Date.now() >= deadline) {
        throw new Error(`Storage is busy: ${lockPath}. If a previous Studio process crashed, stop all Studio processes before removing this lock file.`)
      }
      await setTimeout(25)
    }
  }
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await lock.writeFile(String(process.pid))
    const value = await readJsonFile(file, empty)
    const result = await update(value)
    const output = await fs.open(temporary, 'wx', 0o600)
    try {
      await output.writeFile(JSON.stringify(value, null, 2), 'utf8')
      await output.sync()
    } finally {
      await output.close()
    }
    await fs.rename(temporary, file)
    return result
  } finally {
    await fs.rm(temporary, { force: true })
    await lock.close()
    await fs.unlink(lockPath)
  }
}
