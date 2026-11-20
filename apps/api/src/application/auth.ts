import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { Input } from '@puesto/shared'
import type { Repository } from './ports'
import { demand, PosError } from '../domain/rules'
const profile = 'scrypt-32768-8-3'
const derive = (password: string, salt: string, legacy = false) =>
  new Promise<Buffer>((done, fail) => {
    scrypt(
      password,
      salt,
      64,
      { N: legacy ? 16384 : 32768, r: 8, p: legacy ? 1 : 3, maxmem: 64 * 1024 * 1024 },
      (error, value) => (error ? fail(error) : done(value)),
    )
  })
export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export class Auth {
  constructor(private repo: Repository) {}
  async create(input: Input<'user'>, first: boolean, by: number | null) {
    if (first) demand(!this.repo.hasUsers(), 'El administrador ya existe.')
    const salt = randomBytes(16).toString('hex')
    const hash = profile + '.' + salt + '.' + (await derive(input.password, salt)).toString('hex')
    return this.repo.transaction(() => {
      if (first) demand(!this.repo.hasUsers(), 'El administrador ya existe.')
      const id = this.repo.insert('users', { name: input.name, role: input.role, hash })
      this.repo.insert('audit', { action: first ? 'setup' : 'user', userId: by ?? id, reference: id })
      return { id, name: input.name, role: input.role }
    })
  }
  async login(input: Input<'login'>) {
    const user = this.repo.user(input.name)
    const stored = user?.hash ?? profile + '.' + '0'.repeat(32) + '.' + '0'.repeat(128)
    const legacy = !stored.startsWith(profile + '.')
    const [salt, hash] = stored.split('.').slice(-2)
    const check = await derive(input.password, salt, legacy)
    if (!timingSafeEqual(check, Buffer.from(hash, 'hex')) || !user)
      throw new PosError(401, 'LOGIN', 'Usuario o contraseña incorrectos.')
    return { id: user.id, name: user.name, role: user.role }
  }
  issue(userId: number) {
    const token = randomBytes(32).toString('hex')
    this.repo.removeSession('')
    this.repo.insert('sessions', { token: digest(token), expires: Date.now() + 12 * 3600000, userId })
    return token
  }
}
