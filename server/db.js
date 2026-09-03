import sql from 'mssql'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// server/.env tiene prioridad; ../.env (raíz del proyecto) como respaldo
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config({ path: path.join(__dirname, '.env') })
dotenv.config({ path: path.join(__dirname, '.env.local') })

const dbName = (process.env.MSSQL_DATABASE || 'CRMTaller').trim()
const config = {
  server: process.env.MSSQL_HOST || '82.223.37.171',
  port: Number(process.env.MSSQL_PORT || 1433),
  ...(dbName && !/^<|predeterminado|default$/i.test(dbName) ? { database: dbName } : {}),
  user: process.env.MSSQL_USER || 'aviapi',
  password: process.env.MSSQL_PASSWORD || '',
  options: {
    encrypt: String(process.env.MSSQL_ENCRYPT ?? 'true').toLowerCase() !== 'false',
    trustServerCertificate: String(process.env.MSSQL_TRUST_CERT ?? 'true').toLowerCase() !== 'false',
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
}

/** @type {sql.ConnectionPool | null} */
let pool = null

export async function getPool() {
  if (!config.password) {
    throw new Error('Falta MSSQL_PASSWORD en server/.env.local (o server/.env)')
  }
  if (!pool) {
    pool = await sql.connect(config)
  }
  return pool
}

export { sql }
