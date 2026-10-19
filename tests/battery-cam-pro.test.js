const assert = require('node:assert/strict')
const { test, afterEach } = require('node:test')
const axios = require('axios')
const battery = require('../src/batteryCamPro')
const types = require('../src/types')
types.Characteristic = { On: 'On' }
const Camera = require('../src/accessories/WyzeCamera')
const originalPost = axios.post
afterEach(() => { axios.post = originalPost })

function client() {
  return {
    access_token: 'test-token',
    maybeLogin: async () => {},
    refreshToken: async () => { throw new Error('Unexpected refresh') }
  }
}

function camera(model = 'AN_RSCW') {
  const updates = []
  const errors = []
  const result = Object.create(Camera.prototype)
  result.homeKitAccessory = { displayName: 'Test camera', context: { mac: 'test-device', product_model: model } }
  result.plugin = { client: client(), config: {}, log: { error: error => errors.push(error) } }
  result.privacySwitch = { getCharacteristic: () => ({ updateValue: value => updates.push(value) }) }
  result.power_switch = false
  return { result, updates, errors }
}

test('an asleep battery camera reads logical power instead of treating it as offline', async () => {
  axios.post = async (url, body, options) => {
    assert.match(url, /device-property\/get_iot_prop$/)
    assert.equal(body.targetInfo.productModel, 'AN_RSCW')
    assert.equal(options.headers.authorization, 'test-token')
    return { data: { code: 1, data: { capabilities: [{ name: 'iot-device', properties: { 'iot-power': false } }] } } }
  }
  const { result, updates, errors } = camera()
  await result.updateCharacteristics({ conn_state: 0 })
  assert.deepEqual(updates, [false])
  assert.deepEqual(errors, [])
  assert.equal(await result.handleOnGetPrivacySwitch(), false)
})

test('battery power commands use wakeup/sleep and update the cached switch after success', async () => {
  const commands = []
  const { result } = camera()
  axios.post = async (url, body) => {
    assert.match(url, /action\/run_action$/)
    assert.match(body.transactionId, /^[a-f0-9]{32}$/)
    assert.equal(body.capabilities[0].functions[0].in['wakeup-live-view'], '1')
    commands.push(body.capabilities[0].functions[0].name)
    return { data: { code: 1, data: { resultList: [{ code: 1 }] } } }
  }
  await result.handleOnSetPrivacySwitch(true)
  assert.equal(await result.handleOnGetPrivacySwitch(), true)
  await result.handleOnSetPrivacySwitch(false)
  assert.equal(await result.handleOnGetPrivacySwitch(), false)
  assert.deepEqual(commands, ['wakeup', 'sleep'])
})

test('a rejected command reaches HomeKit and does not falsely update cached power', async () => {
  axios.post = async () => ({ data: { code: 1003 } })
  const { result } = camera()
  await assert.rejects(result.handleOnSetPrivacySwitch(true), /API error \(1003\)/)
  assert.equal(result.power_switch, false)
})

test('read failures mark the switch unavailable rather than silently reporting OFF', async () => {
  axios.post = async () => ({ data: { code: 1, data: { capabilities: [] } } })
  const { result, updates, errors } = camera()
  await result.updateCharacteristics({ conn_state: 1 })
  assert.equal(updates[0].message, 'No Response')
  assert.equal(errors.length, 1)
  await assert.rejects(result.handleOnGetPrivacySwitch(), /No Response/)
})

test('a successful HTTP envelope with a rejected device action is still a failure', async () => {
  axios.post = async () => ({ data: { code: 1, data: { resultList: [{ code: 3 }] } } })
  const { result } = camera()
  await assert.rejects(result.handleOnSetPrivacySwitch(true), /rejected the power command/)
  assert.equal(result.power_switch, false)
})

test('an expired access token refreshes once and uses the new token', async () => {
  const api = client()
  let refreshes = 0
  api.refreshToken = async () => { refreshes++; api.access_token = 'new-token' }
  const tokens = []
  axios.post = async (url, body, options) => {
    tokens.push(options.headers.authorization)
    return tokens.length === 1
      ? { data: { code: 2001 } }
      : { data: { code: 1, data: { capabilities: [{ name: 'iot-device', properties: { 'iot-power': true } }] } } }
  }
  assert.equal(await battery.getPower(api, 'test-device', 'AN_RSCW'), true)
  assert.equal(refreshes, 1)
  assert.deepEqual(tokens, ['test-token', 'new-token'])
})

test('other camera models retain the existing API and await its failure', async () => {
  const { result } = camera('HL_CAM4')
  result.plugin.client.cameraPrivacy = async (mac, model, command) => {
    assert.equal(command, 'power_on')
    throw new Error('Existing API rejected command')
  }
  await assert.rejects(result.handleOnSetPrivacySwitch(true), /Existing API rejected command/)
})

test('transport failures do not include request credentials in errors', async () => {
  axios.post = async () => { throw Object.assign(new Error('test-token must not leak'), { response: { status: 503 } }) }
  await assert.rejects(battery.setPower(client(), 'test-device', 'AN_RSCW', true), error => {
    assert.match(error.message, /503/)
    assert.doesNotMatch(error.message, /test-token/)
    return true
  })
})
