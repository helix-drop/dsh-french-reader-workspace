import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageName = '@local/french-close-reading'
const artifacts = new WorkspaceTypertGenerator(root).generate([packageName], ['host'])
const host = artifacts.find((artifact) => artifact.package === packageName && artifact.face === 'host')
if (!host) throw new Error(`Typert did not emit the Host face for ${packageName}`)
if (!host.remote) throw new Error(`Typert did not emit the Remote contribution for ${packageName}`)

const output = path.join(root, host.packageRoot, 'lib')
await mkdir(output, { recursive: true })
await writeFile(path.join(output, 'typert.host.js'), host.js)
await writeFile(path.join(output, 'typert.host.d.ts'), host.dts)
await writeFile(path.join(output, 'typert.remote-client.js'), host.remote.js)
await writeFile(path.join(output, 'typert.remote-client.d.ts'), host.remote.dts)
await writeFile(path.join(output, 'typert.remote-client.d.ts.map'), host.remote.dtsMap)
console.log(`Generated strict Host + Client Remote contracts for ${packageName}`)
