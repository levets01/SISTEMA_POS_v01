import forge from 'node-forge'
import QRCode from 'qrcode'
import { networkInterfaces } from 'node:os'
import { mkdirSync, readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs'
import { randomBytes, X509Certificate } from 'node:crypto'
import { join } from 'node:path'
import { isIPv4 } from 'node:net'
import { demand } from '../domain/rules'
export function privateIp(ip: string) {
  return (
    isIPv4(ip) &&
    (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip))
  )
}
export function lanAddress(selected?: string) {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n?.family === 'IPv4' && !n.internal && privateIp(n.address))
    .map((n) => n!.address)
  if (selected) {
    return ips.includes(selected) ? selected : undefined
  }
  return ips[0]
}
const pki = forge.pki
function certificate(
  name: string,
  issuer?: { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey },
  ip?: string,
) {
  const keys = pki.rsa.generateKeyPair(3072),
    cert = pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01' + randomBytes(15).toString('hex')
  cert.validity.notBefore = new Date(Date.now() - 300000)
  cert.validity.notAfter = new Date(Date.now() + (issuer ? 180 : 3650) * 86400000)
  cert.setSubject([{ name: 'commonName', value: name }])
  cert.setIssuer(issuer ? issuer.cert.subject.attributes : cert.subject.attributes)
  cert.setExtensions(
    issuer
      ? [
          { name: 'basicConstraints', cA: false, critical: true },
          { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
          { name: 'extKeyUsage', serverAuth: true },
          { name: 'subjectAltName', altNames: [{ type: 7, ip }] },
        ]
      : [
          { name: 'basicConstraints', cA: true, pathLenConstraint: 0, critical: true },
          { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
          { name: 'subjectKeyIdentifier' },
        ],
  )
  cert.sign(issuer?.key ?? keys.privateKey, forge.md.sha256.create())
  return { cert, key: keys.privateKey }
}
export async function localTLS(root: string, ip: string, port: number) {
  const dir = join(root, 'tls')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const vault = join(dir, 'autoridad.json'),
    caPath = join(dir, 'Puesto-POS-CA.crt')
  if (!existsSync(vault)) {
    const { cert, key } = certificate('Puesto POS ' + randomBytes(5).toString('hex'))
    writeFileSync(
      vault + '.tmp',
      JSON.stringify({ cert: pki.certificateToPem(cert), key: pki.privateKeyToPem(key) }),
      { mode: 0o600 },
    )
    renameSync(vault + '.tmp', vault)
  }
  const ca = JSON.parse(readFileSync(vault, 'utf8')) as { cert: string; key: string }
  const caCert = new X509Certificate(ca.cert)
  demand(
    Date.parse(caCert.validTo) > Date.now() + 86400000,
    'La autoridad local expiró. Renueva la confianza del celular.',
  )
  writeFileSync(caPath, ca.cert)
  const leafPath = join(dir, 'servidor.json')
  let leaf = existsSync(leafPath)
    ? (JSON.parse(readFileSync(leafPath, 'utf8')) as { cert: string; key: string })
    : undefined
  const existing = leaf && new X509Certificate(leaf.cert)
  if (
    !existing?.checkIP(ip) ||
    Date.parse(existing.validTo) < Date.now() + 7 * 86400000 ||
    !existing.verify(caCert.publicKey)
  ) {
    const { cert, key } = certificate(
      ip,
      { cert: pki.certificateFromPem(ca.cert), key: pki.privateKeyFromPem(ca.key) },
      ip,
    )
    leaf = { cert: pki.certificateToPem(cert), key: pki.privateKeyToPem(key) }
    writeFileSync(leafPath + '.tmp', JSON.stringify(leaf), { mode: 0o600 })
    renameSync(leafPath + '.tmp', leafPath)
  }
  const url = 'https://' + ip + ':' + port
  return {
    tls: leaf!,
    info: {
      url,
      qr: await QRCode.toDataURL(url, { width: 220, margin: 2 }),
      caPath,
      fingerprint: caCert.fingerprint256,
      dataDir: root,
    },
  }
}
