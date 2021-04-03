const builder = require('electron-builder')

;(async () => {
  await builder.build({
    projectDir: 'client',
    config: {
      win: {
        target: ['nsis', 'zip'],
        icon: 'icon.ico',
      },
      mac: {
        target: 'mas',
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
