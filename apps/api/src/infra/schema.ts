import type { DatabaseSync } from 'node:sqlite'
import { demand } from '../domain/rules'
export const appId = 0x50555354
const now = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
export const migrations = [
  `PRAGMA application_id=${appId};
CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,role TEXT NOT NULL CHECK(role IN ('admin','seller')),hash TEXT NOT NULL);
CREATE TABLE sessions(token TEXT PRIMARY KEY,userId INTEGER NOT NULL REFERENCES users,expires INTEGER NOT NULL);
CREATE INDEX sess_expiry ON sessions(expires);
CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,presentation TEXT NOT NULL,barcode TEXT UNIQUE NOT NULL,internal TEXT NOT NULL,cost INTEGER NOT NULL CHECK(cost>=0),price INTEGER NOT NULL CHECK(price>=0),minStock INTEGER NOT NULL CHECK(minStock>=0),stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),active INTEGER NOT NULL CHECK(active IN(0,1)),image TEXT NOT NULL DEFAULT '') STRICT;
CREATE TABLE customers(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1))) STRICT;
CREATE TABLE suppliers(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1))) STRICT;
CREATE TABLE shifts(id INTEGER PRIMARY KEY,opened TEXT NOT NULL DEFAULT ${now},closed TEXT,userId INTEGER NOT NULL REFERENCES users,closedBy INTEGER REFERENCES users,base INTEGER NOT NULL CHECK(base>=0),counted INTEGER CHECK(counted>=0)) STRICT;
CREATE UNIQUE INDEX one_open ON shifts((1)) WHERE closed IS NULL;
CREATE TABLE sales(id INTEGER PRIMARY KEY,created TEXT NOT NULL DEFAULT ${now},userId INTEGER NOT NULL REFERENCES users,customerId INTEGER REFERENCES customers,shiftId INTEGER NOT NULL REFERENCES shifts,total INTEGER NOT NULL,cash INTEGER NOT NULL,transfer INTEGER NOT NULL,change INTEGER NOT NULL,credit INTEGER NOT NULL,returned INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'confirmed') STRICT;
CREATE TABLE saleLines(id INTEGER PRIMARY KEY,saleId INTEGER NOT NULL REFERENCES sales,productId INTEGER NOT NULL REFERENCES products,name TEXT NOT NULL,qty INTEGER NOT NULL CHECK(qty>0),price INTEGER NOT NULL CHECK(price>=0),returnedQty INTEGER NOT NULL DEFAULT 0 CHECK(returnedQty BETWEEN 0 AND qty),UNIQUE(saleId,productId)) STRICT;
CREATE TABLE purchases(id INTEGER PRIMARY KEY,supplierId INTEGER NOT NULL REFERENCES suppliers,userId INTEGER NOT NULL REFERENCES users,total INTEGER NOT NULL,created TEXT NOT NULL DEFAULT ${now}) STRICT;
CREATE TABLE purchaseLines(id INTEGER PRIMARY KEY,purchaseId INTEGER NOT NULL REFERENCES purchases,productId INTEGER NOT NULL REFERENCES products,qty INTEGER NOT NULL CHECK(qty>0),cost INTEGER NOT NULL CHECK(cost>=0),UNIQUE(purchaseId,productId)) STRICT;
CREATE TABLE reversals(id INTEGER PRIMARY KEY,saleId INTEGER NOT NULL REFERENCES sales,userId INTEGER NOT NULL REFERENCES users,created TEXT NOT NULL DEFAULT ${now},mode TEXT NOT NULL,reason TEXT NOT NULL,total INTEGER NOT NULL) STRICT;
CREATE TABLE reversalLines(id INTEGER PRIMARY KEY,reversalId INTEGER NOT NULL REFERENCES reversals,productId INTEGER NOT NULL REFERENCES products,qty INTEGER NOT NULL CHECK(qty>0),price INTEGER NOT NULL) STRICT;
CREATE TABLE inventory(id INTEGER PRIMARY KEY,productId INTEGER NOT NULL REFERENCES products,userId INTEGER NOT NULL REFERENCES users,qty INTEGER NOT NULL CHECK(qty!=0),reason TEXT NOT NULL,reference INTEGER,created TEXT NOT NULL DEFAULT ${now}) STRICT;
CREATE TABLE cash(id INTEGER PRIMARY KEY,shiftId INTEGER NOT NULL REFERENCES shifts,userId INTEGER NOT NULL REFERENCES users,amount INTEGER NOT NULL,method TEXT NOT NULL CHECK(method IN ('cash','transfer')),source TEXT NOT NULL,reason TEXT NOT NULL,reference INTEGER,created TEXT NOT NULL DEFAULT ${now}) STRICT;
CREATE TABLE debt(id INTEGER PRIMARY KEY,customerId INTEGER NOT NULL REFERENCES customers,userId INTEGER NOT NULL REFERENCES users,amount INTEGER NOT NULL CHECK(amount!=0),chargeId INTEGER REFERENCES debt,saleId INTEGER REFERENCES sales,source TEXT NOT NULL,reason TEXT NOT NULL,method TEXT,created TEXT NOT NULL DEFAULT ${now}) STRICT;
CREATE TABLE operations(key TEXT PRIMARY KEY,userId INTEGER NOT NULL REFERENCES users,action TEXT NOT NULL,digest TEXT NOT NULL,response TEXT NOT NULL);
CREATE TABLE audit(id INTEGER PRIMARY KEY,userId INTEGER REFERENCES users,action TEXT NOT NULL,reference INTEGER,created TEXT NOT NULL DEFAULT ${now});
CREATE TABLE settings(id INTEGER PRIMARY KEY CHECK(id=1),business TEXT NOT NULL,retention INTEGER NOT NULL,exportDir TEXT NOT NULL);
INSERT INTO settings VALUES(1,'Mi negocio',15,'');`,
  `CREATE INDEX stock_product ON inventory(productId,id);
CREATE INDEX debt_customer ON debt(customerId,id);
CREATE INDEX debt_charge ON debt(chargeId);
CREATE INDEX sale_customer ON sales(customerId,id);
CREATE INDEX sale_date ON sales(created);
CREATE INDEX cash_shift ON cash(shiftId,id);
CREATE INDEX cash_date ON cash(created);
CREATE INDEX lines_product ON saleLines(productId);
CREATE INDEX product_name ON products(name COLLATE NOCASE);`,
]
export function version(db: DatabaseSync) {
  return Number(db.prepare('PRAGMA user_version').get()!.user_version)
}
export function migrate(db: DatabaseSync, before: () => void, target = migrations.length) {
  const current = version(db)
  demand(current <= target, 'La base requiere una versión más reciente de Puesto POS.')
  if (current === target) return
  if (current > 0) before()
  db.exec('BEGIN EXCLUSIVE')
  try {
    for (let i = current; i < target; i++) {
      db.exec(migrations[i])
      db.exec('PRAGMA user_version=' + String(i + 1))
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
