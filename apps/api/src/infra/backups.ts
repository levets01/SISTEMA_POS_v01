import { DatabaseSync } from 'node:sqlite'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { basename, join, isAbsolute, resolve, relative, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { appId, migrate, migrations, version } from './schema'
import { demand } from '../domain/rules'
import { backupRecord, type Output } from '@puesto/shared'
const signature = (db: DatabaseSync) => String(db.prepare('PRAGMA application_id').get()?.application_id)
function verify(db: DatabaseSync) {
  demand(
    db.prepare('PRAGMA integrity_check').get()?.integrity_check === 'ok',
    'Falló la integridad SQLite.',
  )
  demand(!db.prepare('PRAGMA foreign_key_check').get(), 'Hay referencias inválidas.')
  demand(signature(db) === String(appId), 'Archivo de otro sistema.')
}
export function externalDirectory(candidate: string, protectedDirs: string[]) {
  demand(isAbsolute(candidate), 'Selecciona una carpeta absoluta fuera del programa.')
  const path = resolve(candidate)
  for (const dir of protectedDirs) {
    const rel = relative(resolve(dir), path)
    demand(
      rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel),
      'La carpeta de datos debe estar fuera del programa.',
    )
  }
  return path
}
export class Backups {
  readonly dir: string
  constructor(
    readonly db: DatabaseSync,
    readonly root: string,
  ) {
    this.dir = join(root, 'respaldos')
    mkdirSync(this.dir, { recursive: true })
  }
  history(): Output<'backups'> {
    const p = join(this.root, 'respaldos.jsonl')
    if (!existsSync(p)) return []
    return readFileSync(p, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((s) => backupRecord.parse(JSON.parse(s)))
      .reverse()
  }
  log(action: string, file: string, result: string, location: string, operation?: string) {
    appendFileSync(
      join(this.root, 'respaldos.jsonl'),
      JSON.stringify({ created: new Date().toISOString(), action, file, result, location, operation }) +
        '\n',
    )
  }
  create(
    action: string,
    exportDir = '',
    retention = 15,
    options: { preserve?: string; operation?: string } = {},
  ) {
    const file =
        'puesto-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.sqlite',
      location = join(this.dir, file),
      tmp = location + '.partial'
    try {
      this.db.prepare('VACUUM INTO ?').run(tmp)
      const check = new DatabaseSync(tmp, { readOnly: true })
      try {
        verify(check)
        demand(version(check) === version(this.db), 'Esquema de respaldo incorrecto.')
      } finally {
        check.close()
      }
      renameSync(tmp, location)
      this.log(action, file, 'Correcto', location, options.operation)
      if (exportDir) {
        demand(isAbsolute(exportDir), 'La carpeta adicional debe ser absoluta.')
        mkdirSync(exportDir, { recursive: true })
        const dest = join(exportDir, file)
        if (resolve(dest) !== resolve(location)) {
          copyFileSync(location, dest + '.partial')
          renameSync(dest + '.partial', dest)
          this.log('Copia adicional', file, 'Correcto', dest)
        }
      }
      const files = readdirSync(this.dir)
        .filter((f) => /^puesto-[\w-]+\.sqlite$/.test(f))
        .sort()
        .reverse()
      for (const f of files.slice(retention)) {
        const expired = join(this.dir, f)
        if (f !== file && expired !== options.preserve) rmSync(expired)
      }
      return file
    } catch (e) {
      rmSync(tmp, { force: true })
      this.log(action, file, 'Falló', exportDir || location, options.operation)
      throw e
    }
  }
  configured(action: string, options: { preserve?: string; operation?: string } = {}) {
    const s = this.db.prepare('SELECT * FROM settings WHERE id=1').get()!
    return this.create(action, String(s.exportDir), Number(s.retention), options)
  }
  restore(file: string, actorId: number) {
    const path = isAbsolute(file) ? resolve(file) : join(this.dir, basename(file))
    demand(
      path.toLowerCase().endsWith('.sqlite') && existsSync(path) && statSync(path).isFile(),
      'Selecciona una copia .sqlite disponible.',
    )
    demand(
      resolve(path) !== resolve(this.root, 'negocio.sqlite'),
      'Selecciona un respaldo diferente de la base en uso.',
    )
    try {
      const source = new DatabaseSync(path, { readOnly: true })
      try {
        verify(source)
        demand(
          version(source) === migrations.length,
          'La versión de respaldo debe coincidir con el esquema actual.',
        )
        const manifest = (db: DatabaseSync) =>
          JSON.stringify(
            db
              .prepare(
                "SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
              )
              .all(),
          )
        demand(manifest(source) === manifest(this.db), 'La estructura de la copia es incompatible.')
      } finally {
        source.close()
      }
      this.configured('Antes de restaurar', { preserve: path })
      this.db.prepare('ATTACH DATABASE ? AS recovery').run(path)
      try {
        this.db.exec('BEGIN EXCLUSIVE; PRAGMA defer_foreign_keys=ON')
        try {
          const tables = this.db
            .prepare(
              "SELECT name FROM main.sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            )
            .all()
            .map((r) => String(r.name))
          for (const t of tables) this.db.exec('DELETE FROM main.' + t)
          for (const t of tables)
            if (t !== 'sessions') this.db.exec('INSERT INTO main.' + t + ' SELECT * FROM recovery.' + t)
          verify(this.db)
          this.db.exec('COMMIT')
        } catch (e) {
          this.db.exec('ROLLBACK')
          throw e
        }
      } finally {
        this.db.exec('DETACH DATABASE recovery')
      }
      this.log('Restauración por usuario ' + actorId, basename(path), 'Correcto', path)
    } catch (e) {
      this.log('Restauración por usuario ' + actorId, basename(path), 'Falló', path)
      throw e
    }
  }
}
export function openDatabase(root: string) {
  mkdirSync(root, { recursive: true })
  const db = new DatabaseSync(join(root, 'negocio.sqlite'))
  try {
    db.exec(
      'PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL',
    )
    const backups = new Backups(db, root)
    if (version(db) || db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table'").get()) verify(db)
    migrate(db, () => backups.configured('Antes de migrar'))
    return { db, backups }
  } catch (e) {
    db.close()
    throw e
  }
}
