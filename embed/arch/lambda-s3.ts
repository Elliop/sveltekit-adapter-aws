import { createReadStream } from 'fs'
import { lookup } from 'mime-types'
import path from 'path'
import { base, bridgeAuthToken } from '../external/params.js'
import type { AwsLambda } from '../external/types/awslambda.js'
import { respond } from '../external/utils/respond.js'
import { runStream } from '../external/utils/runStream.js'
import { verdictStaticAssets } from '../external/utils/verdictStaticAssets.js'

declare const awslambda: AwsLambda

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

    const assetsPath = verdictStaticAssets({
      method,
      path: rawPath
    })

    if (assetsPath) {
      const filePath = assetsPath.replace(base, '')
      const type = lookup(filePath)

      setResponseHeader(200, {
        'content-type': type ? type : 'application/octet-stream'
      })

      const src = createReadStream(path.join(process.cwd(), 'assets', filePath))

      src.on('data', (chunk) => responseStream.write(chunk))
      src.on('end', () => closeResponseStream())

      return
    }

    const url = `https://${domainName}${rawPath}${
      rawQueryString ? `?${rawQueryString}` : ''
    }`

    const response = await respond(
      url,
      {
        method,
        body: request.body,
        headers: request.headers
      },
      {
        sourceIp,
        isBase64Encoded
      }
    )

    // TODO: If the response header is too long, a 502 error will occur on Gateway, so delete it.
    response.headers.delete('link')

    return runStream({
      response,
      responseStream,
      awslambda
    })
  }
)
