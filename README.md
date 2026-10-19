# Homebridge Wyze Smart Home — Battery Cam Pro

A fork of [jfarmer08/homebridge-wyze-smart-home](https://github.com/jfarmer08/homebridge-wyze-smart-home) with on/off controls for Wyze Battery Cam Pro (`AN_RSCW`). Each camera appears in Apple Home as a switch.

Battery Cam Pro uses Wyze's cloud DeviceMgmt API: `wakeup` enables the camera, `sleep` disables it, and `iot-power` supplies its current power state. Camera commands are awaited so rejected actions appear as errors in HomeKit.

## Configuration

Configure the Wyze platform in Homebridge's plugin settings, or add this entry to the `platforms` array in your Homebridge configuration:

```json
{
  "platform": "WyzeSmartHome",
  "name": "Wyze",
  "username": "YOUR_WYZE_EMAIL",
  "password": "YOUR_WYZE_PASSWORD",
  "keyId": "YOUR_WYZE_KEY_ID",
  "apiKey": "YOUR_WYZE_API_KEY",
  "refreshInterval": 60000,
  "hms": false,
  "apiLogEnabled": false
}
```

Use the email and password for the Wyze account that owns the cameras. Obtain the API Key and Key ID from the [Wyze developer portal](https://developer-api-console.wyze.com/). All four credentials are required. Wyze API keys expire after one year; see [Wyze's API-key instructions](https://support.wyze.com/hc/en-us/articles/16129834216731-Creating-an-API-Key).

Keep account credentials and tokens in your local Homebridge configuration and storage.

## Tests

After installing dependencies, run:

```sh
npm test
```

The tests cover Battery Cam Pro state and power commands, rejected actions, unavailable-state handling, access-token refresh, and the existing command path for other camera models.
