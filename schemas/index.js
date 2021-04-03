const mongoose = require('mongoose')
const fs = require('fs')
const cliProgress = require('cli-progress')

const setting = require('../setting.json')

module.exports = () => {
  const connect = () => {
    mongoose.set('useCreateIndex', true)
    mongoose.connect(
      `mongodb://${setting.MONGODB_HOST}:${setting.MONGODB_PORT || 27017}`,
      {
        dbName: setting.DBNAME,
        user: setting.MONGODB_USER,
        useNewUrlParser: true,
        useUnifiedTopology: true,
      },
      (error) => {
        if (error) {
          console.log(
            `몽고디비 연결 중 오류가 발생하였습니다!\n오류 로그\n${error}`,
          )
        } else {
          console.log(`몽고디비 연결에 성공하였습니다.`)
        }
      },
    )
  }
  connect()
  mongoose.connection.on('error', (error) => {
    console.log(`몽고디비 연결 중 오류가 발생하였습니다!\n오류 로그\n${error}`)
  })
  mongoose.connection.on('disconnected', () => {
    console.error('몽고디비 연결이 끊어졌습니다. 연결을 재시도합니다.')
    connect()
  })

  const schemaList = fs.readdirSync('./schemas')
  const schemasBar = new cliProgress.SingleBar({
    format: '스키마 로드중 | {bar} | {value}/{total}',
  })
  schemasBar.start(schemaList.length - 1, 0)
  schemaList.forEach((file) => {
    if (file !== 'index.js') {
      require(`./${file}`)
      schemasBar.increment()
    }
  })
  schemasBar.stop()
}
