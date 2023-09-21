import type { SSRManifest, Server as ServerType } from '@sveltejs/kit'
import { createReadStream } from 'fs'
import { lookup } from 'mime-types'
import path from 'path'
import { base, bridgeAuthToken, staticAssetsPaths } from '../external/params.js'
import { awslambda } from '../external/types/awslambda.js'
import { Server } from '../index.js'
import { manifest } from '../manifest.js'
import { env } from '../external/utils/env.js'

export const handler = awslambda.streamifyResponse(
  async (request, responseStream) => {
    const {
      requestContext,
      headers,
      rawPath,
      rawQueryString,
      isBase64Encoded
    } = request

    const setResponseHeader = (
      statusCode: number,
      headers: Record<string, string>
    ) => {
      responseStream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode,
        headers
      })
    }

    const closeResponseStream = () => {
      responseStream.write('')
      responseStream.end()
    }

    if (headers['bridge-authorization'] !== `Plain ${bridgeAuthToken}`) {
      setResponseHeader(403, {})
      responseStream.write('403 Forbidden')
      return closeResponseStream()
    }

    const {
      http: { method, sourceIp },
      domainName
    } = requestContext

    const assetsHandling = (assetsPath: string) => {
      const filePath = assetsPath.replace(base, '')
      const type = lookup(filePath)

      setResponseHeader(200, {
        'content-type': type ? type : 'application/octet-stream'
      })

      if (method === 'HEAD') {
        return closeResponseStream()
      }

      const src = createReadStream(path.join(process.cwd(), 'assets', filePath))

      src.on('data', (chunk) => responseStream.write(chunk))
      src.on('end', () => closeResponseStream())
    }

    if (method === 'GET' || method === 'HEAD') {
      // Handling static asset requests
      if (staticAssetsPaths.has(rawPath)) {
        return assetsHandling(rawPath)
      }

      // SSG requests fallback
      if (
        rawPath.endsWith('/') &&
        staticAssetsPaths.has(`${rawPath}index.html`)
      ) {
        return assetsHandling(`${rawPath}index.html`)
      }

      if (staticAssetsPaths.has(`${rawPath}.html`)) {
        return assetsHandling(`${rawPath}.html`)
      }
    }

    const url = `https://${domainName}${rawPath}${
      rawQueryString ? `?${rawQueryString}` : ''
    }`

    const app = new Server(manifest as SSRManifest) as ServerType

    await app.init({ env })

    const response = await app.respond(
      new Request(url, {
        method,
        body: request.body,
        headers: request.headers
      }),
      {
        getClientAddress: () => sourceIp,
        platform: { isBase64Encoded }
      }
    )

    // TODO: If the response header is too long, a 502 error will occur on Gateway, so delete it.
    response.headers.delete('link')

    const responseHeadersEntries = [] as [string, string][]

    response.headers.forEach((value, key) => {
      responseHeadersEntries.push([key, value])
    })

    setResponseHeader(
      response.status,
      Object.fromEntries(responseHeadersEntries)
    )

    if (!response.body) {
      return closeResponseStream()
    }

    const reader = response.body.getReader()

    const readNext = (
      chunk: ReadableStreamReadResult<Uint8Array>
    ): Promise<void> | void => {
      if (chunk.done) {
        return responseStream.end()
      }

      responseStream.write(chunk.value)

      return reader.read().then(readNext)
    }

    return reader.read().then(readNext)
  }
)
