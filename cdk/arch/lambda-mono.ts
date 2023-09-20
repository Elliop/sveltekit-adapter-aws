import {
  CfnOutput,
  Duration,
  Fn,
  Stack,
  StackProps,
  aws_certificatemanager,
  aws_cloudfront,
  aws_cloudfront_origins,
  aws_lambda
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class CDKStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const memorySize = 128 /* $$__MEMORY_SIZE__$$ */
    const enableCDN = false /* $$__ENABLE_CDN__$$ */
    const appDir = '__APP_DIR__'
    const base = '__BASE_PATH__'
    const domainName = '__DOMAIN_NAME__'
    const certificateArn = '__CERTIFICATE_ARN__'
    const environment = {} /* $$__ENVIRONMENT__$$ */

    const lambdaURL = new aws_lambda.Function(this, 'Server', {
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      code: aws_lambda.Code.fromAsset('lambda'),
      handler: 'server.handler',
      architecture: aws_lambda.Architecture.ARM_64,
      memorySize,
      timeout: Duration.seconds(30),
      environment
    }).addFunctionUrl({
      authType: aws_lambda.FunctionUrlAuthType.NONE,
      invokeMode: aws_lambda.InvokeMode.RESPONSE_STREAM
    })

    if (enableCDN) {
      const certificate = certificateArn
        ? aws_certificatemanager.Certificate.fromCertificateArn(
            this,
            'CertificateManagerCertificate',
            certificateArn
          )
        : undefined

      const appPath = `${base}/${appDir}/*`

      const originStr = Fn.select(2, Fn.split('/', lambdaURL.url))
      const origin = new aws_cloudfront_origins.HttpOrigin(originStr, {
        protocolPolicy: aws_cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        originSslProtocols: [aws_cloudfront.OriginSslPolicy.TLS_V1_2],
        customHeaders: {
          'Bridge-Authorization': `Plain __BRIDGE_AUTH_TOKEN__`
        }
      })

      const originRequestPolicy =
        aws_cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER

      const viewerProtocolPolicy =
        aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS

      const cdn = new aws_cloudfront.Distribution(this, 'CloudFront', {
        domainNames: domainName ? [domainName] : undefined,
        certificate,
        defaultBehavior: {
          allowedMethods: aws_cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: aws_cloudfront.CachePolicy.CACHING_DISABLED,
          viewerProtocolPolicy,
          originRequestPolicy,
          origin
        },
        httpVersion: aws_cloudfront.HttpVersion.HTTP2_AND_3,
        additionalBehaviors: {
          [appPath]: {
            allowedMethods: aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD,
            cachePolicy: aws_cloudfront.CachePolicy.CACHING_OPTIMIZED,
            viewerProtocolPolicy,
            originRequestPolicy,
            origin
          }
        }
      })

      if (domainName) {
        new CfnOutput(this, 'Deployed URL', {
          description: 'Deployed URL',
          value: `https://${domainName}`
        })
      }

      new CfnOutput(this, 'CloudFront URL', {
        description: 'CloudFront URL',
        value: `https://${cdn.distributionDomainName}`
      })
    } else {
      new CfnOutput(this, 'Lambda URL', {
        description: 'Lambda URL',
        value: lambdaURL.url
      })
    }
  }
}
