import { it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { migrate, version } from '../apps/api/src/infra/schema'
import { openDatabase } from '../apps/api/src/infra/backups'
it('actualiza una base v1 existente, respalda antes y conserva negocio y movimientos', () => {
  const root = mkdtempSync(join(tmpdir(), 'puesto-v1-'))
  try {
    const old = new DatabaseSync(join(root, 'negocio.sqlite'))
    migrate(old, () => {}, 1)
    old.exec(`INSERT INTO users(name,role,hash) VALUES('Ana','admin','fixture');
   INSERT INTO customers VALUES(1,'María','',1);
   INSERT INTO products VALUES(1,'Pan','Panadería','Unidad','0001','',800,1500,1,8,1,'');
   INSERT INTO shifts(id,userId,base) VALUES(1,1,3000);
   INSERT INTO sales(id,userId,customerId,shiftId,total,cash,transfer,change,credit) VALUES(1,1,1,1,3000,1000,0,0,2000);
   INSERT INTO saleLines(saleId,productId,name,qty,price) VALUES(1,1,'Pan',2,1500);
   INSERT INTO cash(shiftId,userId,amount,method,source,reason,reference) VALUES(1,1,1000,'cash','sale','Venta',1);
   INSERT INTO inventory(productId,userId,qty,reason,reference) VALUES(1,1,-2,'Venta',1);
   INSERT INTO debt(customerId,userId,amount,saleId,source,reason) VALUES(1,1,2000,1,'sale','Venta fiada');`)
    old.close()
    const { db, backups } = openDatabase(root)
    try {
      expect(version(db)).toBe(2)
      const snapshot = backups.history()[0]
      expect(snapshot.action).toBe('Antes de migrar')
      expect(existsSync(snapshot.location)).toBe(true)
      expect(db.prepare('SELECT name,stock,barcode FROM products').get()).toMatchObject({
        stock: 8,
        barcode: '0001',
      })
      expect(db.prepare('SELECT total FROM sales').get()?.total).toBe(3000)
      expect(db.prepare('SELECT name FROM customers').get()?.name).toBe('María')
      expect(db.prepare('SELECT sum(amount) balance FROM debt').get()?.balance).toBe(2000)
      const before = new DatabaseSync(snapshot.location, { readOnly: true })
      expect(version(before)).toBe(1)
      before.close()
      expect(() => backups.restore(snapshot.location, 1)).toThrow(/versión/)
    } finally {
      db.close()
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
it('revierte una migración incompleta y bloquea un esquema futuro', () => {
  const db = new DatabaseSync(':memory:')
  try {
    migrate(db, () => {}, 1)
    db.exec('CREATE INDEX sale_date ON sales(created)')
    expect(() => migrate(db, () => {})).toThrow()
    expect(version(db)).toBe(1)
    expect(db.prepare("SELECT 1 FROM sqlite_schema WHERE name='stock_product'").get()).toBeUndefined()
    db.exec('PRAGMA user_version=99')
    expect(() => migrate(db, () => {})).toThrow(/reciente/)
  } finally {
    db.close()
  }
})
