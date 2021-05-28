// 정현수바부
process.on('unhandledRejection', console.error)
process.on('uncaughtException', console.error)

const fs = require('fs')
const path = require('path')

if (!fs.existsSync('login.json')) fs.copyFileSync('login.example.json', 'login.json')
const login = require('./login.json')

// 기본 모듈
const express = require('express')
const http = require('http')
const passport = require('passport')
const session = require('express-session')
const cookieParser = require('cookie-parser')
const flash = require('connect-flash')
const redis = require('redis')
const cliProgress = require('cli-progress')
const KeycloakStrategy = require('passport-keycloak-oauth2-oidc').Strategy
/**
 * @type {any}
 */
const RedisStore = require('connect-redis')(session)

// const uniqueString = require('unique-string')

global.dataDir = path.join(__dirname, 'data')

global.notesDir = path.join(dataDir, 'notes')

global.avatarsDir = path.join(dataDir, 'avatars')

!fs.existsSync(dataDir) && fs.mkdirSync(dataDir)
!fs.existsSync(notesDir) && fs.mkdirSync(notesDir)
!fs.existsSync(avatarsDir) && fs.mkdirSync(avatarsDir)

// 데이터베이스 스키마
const User = require('./schemas/user')
const Room = require('./schemas/room')
const RoomUser = require('./schemas/room_user')
// const File = require('./schemas/file')
const Chat = require('./schemas/chat')
const Item = require('./schemas/item')
const Inventory = require('./schemas/inventory')
const Promotion = require('./schemas/promotion')

// 웹소켓
const webSocket = require('./socket')

// 설정 파일, 유틸
const setting = require('./setting.json')
// const utils = require('./utils')

// app 정의
const app = express()

// 몽고디비 스키마 연결
const connect = require('./schemas')
connect()

const strategy = new KeycloakStrategy({
    clientID: login.CLIENT_ID,
    realm: login.REALM,
    publicClient: 'false',
    clientSecret: login.CLIENT_SECRET,
    sslRequired: 'external',
    authServerURL: login.SERVER,
    callbackURL: login.REDIRECT_URI,
  },
  async (accessToken, refreshToken, profile, done) => {
    const user = await User.findOne({
      snsID: profile.id,
      provider: 'pikostudio',
    })
    if (user != null) {
      return done(null, user)
    } else {
      const newUser = new User({
        nickname: uniqueString(),
        snsID: profile.id,
        fullID: `pikostudio-${profile.id}`,
        provider: 'pikostudio',
        email: profile.email || null,
      })
      await newUser.save()
      const user = await User.findOne({
        snsID: profile.id,
        provider: profile.provider,
      })
      return done(null, user)
    }
  },
)

passport.use(
  'pikostudio',
  strategy,
)

// 로그인 관련 코드
passport.serializeUser((user, done) => {
  done(null, user)
})
passport.deserializeUser((obj, done) => {
  User.findOne({ snsID: obj.snsID, provider: obj.provider })
    .then(async (u) => {
      const user = JSON.parse(JSON.stringify(u))
      if (user.equip) {
        for (let key of Object.keys(user.equip)) {
          const item = await Item.findOne({ product_id: user.equip[key] })
          const check_have = await Inventory.findOne({
            owner: user.fullID,
            product_id: user.equip[key],
          })
          if (!item || !check_have) {
            const equip = user.equip
            equip[key] = null
            await User.updateOne({ fullID: user.fullID }, { equip })
            user.equip = equip
          } else user[`equip_${key}`] = item['image_name']
        }
      }
      done(null, user)
    })
    .catch((err) => done(err))
})

// 세션, REDIS
let sessionMiddleware
if (setting.USE_REDIS) {
  const client = redis.createClient({
    host: setting['REDIS_HOST'],
    port: setting['REDIS_PORT'],
    password: setting['REDIS_PASSWORD'],
    logError: true,
  })
  sessionMiddleware = session({
    secret: setting.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new RedisStore({ client: client }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
  app.use(sessionMiddleware)
} else {
  sessionMiddleware = session({
    secret: setting.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
  app.use(sessionMiddleware)
}

// 쿠키 파서
app.use(cookieParser())

// Flash 설정
app.use(flash())

// 로그인 관련 코드
app.use(passport.initialize())
app.use(passport.session())

// 정적 파일 제공
const staticOptions = {
  index: ['index.htm', 'index.html'],
}
app.use(express.static(__dirname + '/public/', staticOptions))
// app.get('/client', async (req, res) => {
//   const promiseFS = require('fs/promises')
//   const items = (await promiseFS.readdir(clientDir)).filter((value) =>
//     ['.exe', '.AppImage'].some((value1) => value.endsWith(value1)),
//   )
//   const BASEURL = setting.SITE_BASEURL + '/client/'
//   const win = encodeURI(BASEURL + items.find((r) => r.endsWith('.exe')))
//   const linux = encodeURI(BASEURL + items.find((r) => r.endsWith('.AppImage')))
//   res.json({
//     win,
//     linux,
//   })
// })
app.use('/avatar', express.static(avatarsDir, staticOptions))

// view engine을 EJS로 설정
app.set('views', './views')
const engines = require('consolidate')
const uniqueString = require('unique-string')
const axios = require('axios')
app.engine('pug', engines.pug)
app.engine('ejs', engines.ejs)
app.set('view engine', 'pug')


// render 메서드 수정

app.use((req, res, next) => {
  const render = res.render
  res.render = function(view, options, callback) {
    fs.stat(path.join(__dirname, 'views', view + '.pug'), (err) => {
      if (err) {
        return render.bind(this)(view + '.ejs', options, callback)
      }
      render.bind(this)(view, options, callback)
    })
  }
  next()
})

// IE 경고
app.use((req, res, next) => {
  if (/trident|msie/gi.test(req.get('User-Agent'))) {
    req.flash(
      'Warn',
      'IE는 정상 작동을 보장하지 않습니다. <a href="https://www.google.com/chrome/">Chrome</a>, <a href="https://www.mozilla.org/ko-KR/firefox/new/">FireFox</a>, <a href="https://whale.naver.com/ko/download">Whale</a> 등의 최신 브라우저를 이용해주세요.',
    )
  }
  next()
})

// 벤 감지
app.use((req, res, next) => {
  if (req.isAuthenticated() && req.user && req.user.block_login >= Date.now()) {
    req.flash(
      'Error',
      `관리자에 의해 계정이 정지되어 ${new Date(
        req.user.block_login,
      ).toLocaleDateString()} ${new Date(
        req.user.block_login,
      ).toLocaleTimeString()}까지 로그인이 불가능합니다.<br>계정 정지 사유 : ${
        req.user.block_login_reason || '사유가 지정되지 않음'
      }`,
    )
    req.logout()
    return res.redirect('/login_')
  }
  next()
})

// 닉네임 설정하지 않은 유저 닉네임 설정시키기
app.use((req, res, next) => {
  if (
    req.isAuthenticated() &&
    !req.user.nick_set &&
    req.url !== '/mypage' &&
    req.url !== '/editaccount'
  )
    return res.redirect('/mypage')
  next()
})
// 미리 템플릿 엔진 변수 넣기, 세션 셋팅
app.use((req, res, next) => {
  res.locals.user = req.user
  res.locals.logined = req.isAuthenticated()
  res.locals.isAdmin = req.isAuthenticated() && req.user.admin
  res.locals.servername = setting.SERVER_NAME
  res.locals.FlashError = req.flash('Error')
  res.locals.FlashInfo = req.flash('Info')
  res.locals.FlashWarn = req.flash('Warn')
  res.locals.FlashSuccess = req.flash('success')
  res.locals.session = req.session
  res.locals.isClient = req.session['isClient'] || false
  res.locals.socket = setting.SITE_BASEURL
  res.locals.query = req.query
  res.locals.referrer = req.get('referrer')
  res.locals.referrer_path =
    req.get('referrer') != null
      ? new URL(req.get('referrer')).pathname
      : req.url
  res.locals.req = req
  res.locals.clientURL = `https://github.com/${setting.client}/releases`

  req.session.isLogin = req.isAuthenticated()
  req.session.rejoined_time = Date.now() - (req.session['last_join'] || 0)
  req.session.last_join = Date.now()
  next()
})

// 헤더 설정
app.use((req, res, next) => {
  res.set('Referrer-Policy', 'no-referrer-when-downgrade')
  next()
})

// 클라이언트 인식
app.use((req, res, next) => {
  if (req.query.isClient === 'true') req.session.isClient = true
  if (req.query.isClient === 'false') req.session.isClient = false
  if (
    req.session['isClient'] &&
    !req.isAuthenticated() &&
    !req.url.startsWith('/login_') &&
    !req.url.startsWith('/getqrcode') &&
    !req.url.startsWith('/join') &&
    !req.url.startsWith('/find_my_password')
  )
    return res.redirect('/login_')
  next()
})

// 라우터 불러오기
const routerPaths = fs.readdirSync('./routes')
const routersBar = new cliProgress.SingleBar({
  format: '라우터 로드중 | {bar} | {value}/{total}',
})
routersBar.start(routerPaths.length, 0)
routerPaths.forEach((file) => {
  app.use(require(`./routes/${file}`))
  routersBar.increment()
})
routersBar.stop()
// 서버 구동
let server = http.createServer(app)

webSocket(server, app, sessionMiddleware)

setImmediate(async () => {
  await Room.deleteMany({})
  await RoomUser.deleteMany({})

  // CreateOfficialRoom();
})

// async function CreateOfficialRoom() {
//   const count = await File.countDocuments({ public: true, file_type: 'note' })
//   const note = await File.findOne({ public: true, file_type: 'note' }).skip(
//     utils.getRandomInt(0, count - 1),
//   )
//
//   let token_result
//   let note_file = String(
//     notesDir,
//   )
//   if (path.extname(note.name) === '.signedrhythmcraft') {
//     token_result = utils.verifyToken(note_file)
//     if (token_result.error) return CreateOfficialRoom()
//   } else note_file = JSON.parse(note_file)
//
//   const music = await File.findOne({
//     name: token_result != null ? token_result.music : note_file.music,
//     public: true,
//     file_type: 'music',
//   })
//   if (!music) return CreateOfficialRoom()
//
//   await Room.create({
//     name: '자동 진행 공식 방',
//     master: 'no_master',
//     note_speed: 1000,
//     max_player: 100,
//     roomcode: `official_${uniqueString()}`,
//     music: music.name,
//     music_name: music.originalname,
//     note: token_result || note_file,
//     trusted: token_result != null,
//     auto_manage_room: true,
//   })
// }

setInterval(async () => {
  await Chat.deleteMany({
    createdAt: { $lt: Date.now() - 259200000 },
    reported: false,
  })
  await Promotion.deleteMany({ expires: { $lt: Date.now() } })
}, 60000)

server.listen(setting.PORT, () => {
  console.log('서버가 구동중입니다!')
})
