export {}

declare global {
  namespace Express {
    interface User {
      block_login: number
      block_login_reason: string
      nick_set: boolean
      admin: boolean
      fullID: string
    }
  }
}
