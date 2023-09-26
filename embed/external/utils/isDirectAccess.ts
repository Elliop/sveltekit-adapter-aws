import * as crypto from 'crypto'
import { bridgeAuthToken, domainName } from '../params.js'
import { ResponseStream } from '../types/ResponseStream.js'
import { AwsLambda } from '../types/awslambda.js'
import { qualified } from './qualified.js'

export const isDirectAccess = ({
  request: { headers, rawPath, rawQueryString },
  responseStream,
  awslambda
}: {
  request: Parameters<Parameters<AwsLambda['streamifyResponse']>[0]>[0]
  responseStream: ResponseStream
  awslambda: AwsLambda
}) => {
  const headerStr = headers['bridge-authorization']
  const headerToken = headerStr ? Buffer.from(headerStr) : null
  const token = Buffer.from(`Plain ${bridgeAuthToken}`)

  if (headerToken && crypto.timingSafeEqual(headerToken, token)) {
    return false
  }

  const cfHost = headers['via']?.split(' ')?.[1]

  const domain = domainName ? domainName : cfHost ? cfHost : ''

  responseStream = qualified(
    responseStream,
    domain
      ? {
          awslambda,
          statusCode: 308,
          headers: {
            location: `https://${domain}${rawPath}${
              rawQueryString ? `?${rawQueryString}` : ''
            }`
          }
        }
      : {
          awslambda,
          statusCode: headerToken ? 401 : 403,
          headers: {}
        }
  )

  responseStream.end()

  return true
}
