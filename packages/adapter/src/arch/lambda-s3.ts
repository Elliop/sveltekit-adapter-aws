import { unfurl } from '@jill64/unfurl'
import { build } from 'esbuild'
import { rm, writeFile } from 'fs/promises'
import { nanoid } from 'nanoid'
import path from 'path'
import { Context } from '../types/Context.js'
import { copy } from '../utils/copy.js'
import { listFiles } from '../utils/listFiles.js'
import { root } from '../utils/root.js'

export const lambdaS3 = async ({ builder, options, tmp, out }: Context) => {
  const lambdaAssets = path.join(out, 'lambda', 'assets')

  builder.writeClient(lambdaAssets)
  builder.writePrerendered(lambdaAssets)

  const {
    appDir,
    paths: { base }
  } = builder.config.kit

  const lambdaApp = path.join(lambdaAssets, appDir)

  builder.copy(lambdaApp, path.join(out, 's3', base, appDir))

  await rm(lambdaApp, { recursive: true })

  builder.writeServer(tmp)

  const { list } = await unfurl(
    {
      list: listFiles(lambdaAssets)
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
    .map((file) => file.replace(lambdaAssets, ''))
    .map((file) => path.join(base, file))

  const bridgeAuthToken = nanoid()

  // Copy CDK Stack
  await copy(
    path.join(root, 'cdk/arch/lambda-s3.ts'),
    path.join(out, 'bin', 'cdk-stack.ts'),
    {
      '128 /* $$__MEMORY_SIZE__$$ */': (options?.memory ?? 128).toString(),
      __APP_DIR__: appDir,
      __BASE_PATH__: base,
      __BRIDGE_AUTH_TOKEN__: bridgeAuthToken,
      __DOMAIN_NAME__: options?.domain?.fqdn ?? '',
      __CERTIFICATE_ARN__: options?.domain?.certificateArn ?? '',
      '{} /* $$__ENVIRONMENT__$$ */': JSON.stringify(options?.env ?? {})
    }
  )

  // Embed values
  const params = path.join('external', 'params')
  const staticAssetsPath = path.join(params, 'staticAssetsPaths.ts')

  await copy(
    path.join(root, 'embed', staticAssetsPath),
    path.join(tmp, staticAssetsPath),
    {
      '[] /* $$__STATIC_ASSETS_PATHS__$$ */': JSON.stringify(staticAssetsPaths)
    }
  )

  const basePath = path.join(params, 'base.ts')
  builder.copy(path.join(root, 'embed', basePath), path.join(tmp, basePath), {
    replace: {
      __BASE_PATH__: base
    }
  })

  const appDirPath = path.join(params, 'appDir.ts')
  builder.copy(
    path.join(root, 'embed', appDirPath),
    path.join(tmp, appDirPath),
    {
      replace: {
        __APP_DIR__: appDir
      }
    }
  )

  const bridgeAuthTokenPath = path.join(params, 'bridgeAuthToken.ts')
  builder.copy(
    path.join(root, 'embed', bridgeAuthTokenPath),
    path.join(tmp, bridgeAuthTokenPath),
    {
      replace: {
        __BRIDGE_AUTH_TOKEN__: bridgeAuthToken
      }
    }
  )

  const serverEntryPoint = path.join(tmp, 'server', 'index.ts')
  builder.copy(
    path.join(root, 'embed', 'arch', 'lambda-s3.ts'),
    serverEntryPoint
  )

  await build({
    format: 'cjs',
    bundle: true,
    minify: true,
    external: ['node:*', '@aws-sdk/*'],
    ...options?.esbuild,
    entryPoints: [serverEntryPoint],
    outfile: path.join(out, 'lambda', 'server.js'),
    platform: 'node',
    inject: [path.join(root, 'embed', 'shims.ts')]
  })
}
