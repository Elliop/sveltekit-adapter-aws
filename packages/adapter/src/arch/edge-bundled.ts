import { unfurl } from '@jill64/unfurl'
import { build } from 'esbuild'
import { writeFile } from 'fs/promises'
import path from 'path'
import { Context } from '../types/Context.js'
import { copy } from '../utils/copy.js'
import { listFiles } from '../utils/listFiles.js'
import { root } from '../utils/root.js'

export const edgeBundled = async ({ builder, options, tmp, out }: Context) => {
  const {
    appDir,
    paths: { base }
  } = builder.config.kit

  const s3Assets = path.join(out, 's3', base)

  builder.writeClient(s3Assets)
  builder.writePrerendered(s3Assets)

  builder.writeServer(tmp)

  const { list } = await unfurl(
    {
      list: listFiles(s3Assets)
    },
    writeFile(
      path.join(tmp, 'manifest.js'),
      `export const manifest = ${builder.generateManifest({
        relativePath: './'
      })};\n\n` +
        `export const prerendered = new Set(${JSON.stringify(
          builder.prerendered.paths
        )});\n`
    )
  )

  const staticAssetsPaths = list
    .map((file) => file.replace(s3Assets, ''))
    .filter((file) => !file.startsWith(`/${appDir}/`))
    .map((file) => path.join(base, file))

  // Copy CDK Stack
  builder.copy(
    path.join(root, 'cdk', 'arch', 'edge-bundled.ts'),
    path.join(out, 'bin', 'cdk-stack.ts')
  )

  // Embed values
  await copy(
    path.join(out, 'external', 'params.ts'),
    path.join(tmp, 'external', 'params.ts'),
    {
      '[] /* $$__STATIC_ASSETS_PATHS__$$ */': JSON.stringify(staticAssetsPaths)
    }
  )

  // Make .env file
  if (options?.env) {
    builder.mkdirp(path.join(out, 'edge'))
    await writeFile(
      path.join(out, 'edge', '.env'),
      Object.entries(options.env).reduce(
        (acc, [key, value]) => `${acc}${key}=${value}\n`,
        ''
      )
    )
  }

  const edgeEntryPoint = path.join(tmp, 'edge', 'index.ts')
  builder.copy(
    path.join(root, 'embed', 'arch', 'edge-bundled.ts'),
    edgeEntryPoint
  )

  await build({
    format: 'cjs',
    bundle: true,
    minify: true,
    external: ['node:*'],
    ...options?.esbuild,
    entryPoints: [edgeEntryPoint],
    outfile: path.join(out, 'edge', 'server.js'),
    platform: 'node',
    inject: [path.join(root, 'embed', 'shims.ts')]
  })
}
