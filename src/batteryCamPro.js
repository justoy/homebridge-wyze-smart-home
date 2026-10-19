const axios = require('axios')
const crypto = require('crypto')

const BASE_URL = 'https://devicemgmt-service-beta.wyze.com/device-management/api'

async function request(client, mac, model, endpoint, capabilities) {
  await client.maybeLogin()
  const payload = {
    capabilities,
    nonce: Date.now(),
    targetInfo: { id: mac, productModel: model, type: 'DEVICE' }
  }
  if (endpoint === 'action/run_action') {
    payload.transactionId = crypto.randomBytes(16).toString('hex')
  }

  const send = async () => {
    try {
      const response = await axios.post(`${BASE_URL}/${endpoint}`, payload, {
        headers: { authorization: client.access_token },
        timeout: 10000
      })
      return response.data
    } catch (error) {
      throw new Error(`Wyze Battery Cam Pro request failed (${error.response?.status || error.code || 'network error'})`)
    }
  }

  let response = await send()
  if (Number(response.code) === 2001) {
    await client.refreshToken()
    response = await send()
  }
  if (Number(response.code) !== 1) {
    throw new Error(`Wyze Battery Cam Pro API error (${response.code})`)
  }
  return response.data
}

async function getPower(client, mac, model) {
  const data = await request(client, mac, model, 'device-property/get_iot_prop', [{
    iid: 1,
    name: 'iot-device',
    properties: ['iot-power']
  }])
  const power = data?.capabilities?.find(c => c.name === 'iot-device')?.properties?.['iot-power']
  if (typeof power !== 'boolean') {
    throw new Error('Wyze Battery Cam Pro returned no valid power state')
  }
  return power
}

async function setPower(client, mac, model, on) {
  const data = await request(client, mac, model, 'action/run_action', [{
    iid: 1,
    name: 'iot-device',
    functions: [{ in: { 'wakeup-live-view': '1' }, name: on ? 'wakeup' : 'sleep' }]
  }])
  if (!Array.isArray(data?.resultList) || data.resultList.length === 0 ||
      data.resultList.some(result => Number(result.code) !== 1)) {
    throw new Error('Wyze Battery Cam Pro rejected the power command')
  }
  return data
}

module.exports = { getPower, setPower }
