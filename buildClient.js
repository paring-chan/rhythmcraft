const builder = require('electron-builder')
const fs = require('fs')
fs.writeFileSync(
  'client/data.json',
  JSON.stringify({
    baseUrl: require('./setting.json').SITE_BASEURL + '?isClient=true',
  }),
)
;(async () => {
  await builder.build({
    projectDir: 'client',
    config: {
      win: {
        target: ['nsis'],
        icon: 'icon.ico',
      },
      linux: {
        target: ['appImage'],
        maintainer: 'parnagee9706@gmail.com',
        category: 'Game',
      },
      icon: 'icon.png',
      buildVersion: '1.0.0',
    },
    win: ['nsis'],
    linux: ['appImage'],
  })
})()
