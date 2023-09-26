function handler({ request }) {
  var {
    headers: { host },
    uri,
    querystring
  } = request

  var domainName = '__DOMAIN_NAME__'

  if (!host) {
    return {
      statusCode: 400
    }
  }

  if (host.value === domainName) {
    return request
  }

  var search = ''

  if (querystring) {
    search = '?'

    var keys = Object.keys(querystring)

    keys.forEach((key) => {
      var { value, multiValue } = querystring[key]

      if (search !== '?') {
        search = search + '&'
      }

      search = search + key + '=' + value

      if (multiValue) {
        multiValue.forEach((value) => {
          search = search + '&' + key + '=' + value
        })
      }
    })
  }

  return {
    statusCode: 308,
    headers: {
      location: {
        value: 'https://' + domainName + uri + search
      }
    }
  }
}
