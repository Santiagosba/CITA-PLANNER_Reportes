import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { getPool, sql } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config({ path: path.join(__dirname, '.env') })
dotenv.config({ path: path.join(__dirname, '.env.local') })

const app = express()
const PORT = Number(process.env.API_PORT || 3001)

app.use(cors())
app.use(express.json())

function toIso(v) {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

function mapRow(row) {
  const cita = row.IDCita
    ? {
        idcita: String(row.IDCita).toLowerCase(),
        fecha: toIso(row.CitaFecha),
        nombre: row.Nombre ?? null,
        apellidos: row.Apellidos ?? null,
        telefono: row.Telefono ?? null,
        movil: row.Movil ?? null,
        email: row.Email ?? null,
        matricula: row.Matricula ?? null,
        marca: row.Marca ?? null,
        modelo: row.Modelo ?? null,
        asunto: row.Asunto ?? null,
      }
    : null

  return {
    idpeticion: String(row.IDPeticion).toLowerCase(),
    idtaller: String(row.IDTaller).toLowerCase(),
    descripcion: row.Descripcion ?? null,
    idtipopeticion: row.IDTipoPeticion ?? null,
    tipopeticion: row.TipoPeticion ?? null,
    fechainicio: toIso(row.FechaInicio),
    fechafin: toIso(row.FechaFin),
    fechacreacion: toIso(row.FechaCreacion),
    caller: row.Caller ?? null,
    gestionado: row.Gestionado === true || row.Gestionado === 1,
    gestionemail: row.GestionEmail ?? null,
    gestionfecha: toIso(row.GestionFecha),
    gestionobservaciones: row.GestionObservaciones ?? null,
    idcita: row.IDCita ? String(row.IDCita).toLowerCase() : null,
    cita,
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query('SELECT 1 AS ok')
    res.json({
      ok: true,
      database: process.env.MSSQL_DATABASE || 'aviapi',
      host: process.env.MSSQL_HOST || '82.223.37.171',
      serverTime: result.recordset[0]?.ok === 1 ? new Date().toISOString() : null,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
})

/** Resuelve UUID Hub → IDTaller real en CRM (tabla Talleres). */
app.get('/api/talleres/resolve', async (req, res) => {
  try {
    const pool = await getPool()
    const rawIds = req.query.idTaller
    const ids = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
      .map((id) => String(id).trim().toLowerCase())
      .filter(Boolean)
    const nombre = req.query.nombre ? String(req.query.nombre).trim() : ''
    const expandGrupo = req.query.expandGrupo === 'true' || req.query.expandGrupo === '1'

    /** @type {Map<string, { idtaller: string, nombre: string, grupo: string | null }>} */
    const resolved = new Map()

    async function lookupByIds(uuidList) {
      if (!uuidList.length) return
      const request = pool.request()
      const params = uuidList.map((id, i) => {
        request.input(`id${i}`, sql.UniqueIdentifier, id)
        return `@id${i}`
      })
      const result = await request.query(`
        SELECT LOWER(CAST(IDTaller AS NVARCHAR(36))) AS idtaller, Nombre AS nombre,
               NULLIF(LTRIM(RTRIM(Grupo)), '') AS grupo
        FROM Talleres
        WHERE IDTaller IN (${params.join(', ')})
      `)
      for (const row of result.recordset) {
        resolved.set(String(row.idtaller).toLowerCase(), {
          idtaller: String(row.idtaller).toLowerCase(),
          nombre: row.nombre ?? '',
          grupo: row.grupo ?? null,
        })
      }
    }

    await lookupByIds(ids)

    const missing = ids.filter((id) => !resolved.has(id))
    let via = missing.length === 0 && ids.length ? 'direct' : 'none'

    if (missing.length && nombre) {
      const request = pool.request()
      request.input('nombre', sql.NVarChar, nombre)
      request.input('nombreLike', sql.NVarChar, `%${nombre}%`)

      let matches = (
        await request.query(`
          SELECT LOWER(CAST(IDTaller AS NVARCHAR(36))) AS idtaller, Nombre AS nombre,
                 NULLIF(LTRIM(RTRIM(Grupo)), '') AS grupo
          FROM Talleres
          WHERE LOWER(Nombre) = LOWER(@nombre)
        `)
      ).recordset

      if (!matches.length) {
        matches = (
          await request.query(`
            SELECT LOWER(CAST(IDTaller AS NVARCHAR(36))) AS idtaller, Nombre AS nombre,
                   NULLIF(LTRIM(RTRIM(Grupo)), '') AS grupo
            FROM Talleres
            WHERE Nombre LIKE @nombreLike
            ORDER BY Nombre
          `)
        ).recordset
      }

      if (!matches.length) {
        const tokens = nombre
          .split(/\s+/)
          .map((t) => t.trim())
          .filter((t) => t.length > 2)
        if (tokens.length) {
          let tokenSql = 'SELECT LOWER(CAST(IDTaller AS NVARCHAR(36))) AS idtaller, Nombre AS nombre, NULLIF(LTRIM(RTRIM(Grupo)), \'\') AS grupo FROM Talleres WHERE 1=1'
          const tokenReq = pool.request()
          tokens.forEach((token, i) => {
            tokenReq.input(`tok${i}`, sql.NVarChar, `%${token}%`)
            tokenSql += ` AND Nombre LIKE @tok${i}`
          })
          tokenSql += ' ORDER BY Nombre'
          matches = (await tokenReq.query(tokenSql)).recordset
        }
      }

      for (const row of matches) {
        resolved.set(String(row.idtaller).toLowerCase(), {
          idtaller: String(row.idtaller).toLowerCase(),
          nombre: row.nombre ?? '',
          grupo: row.grupo ?? null,
        })
      }
      if (matches.length) via = 'nombre'
    }

    const grupos = [...new Set([...resolved.values()].map((t) => t.grupo).filter(Boolean))]
    const shouldExpandByGrupoField =
      expandGrupo && nombre && missing.length > 0

    if (shouldExpandByGrupoField) {
      const request = pool.request()
      request.input('nombre', sql.NVarChar, nombre)
      request.input('nombreLike', sql.NVarChar, `${nombre}%`)
      const expanded = (
        await request.query(`
          SELECT LOWER(CAST(IDTaller AS NVARCHAR(36))) AS idtaller, Nombre AS nombre,
                 NULLIF(LTRIM(RTRIM(Grupo)), '') AS grupo
          FROM Talleres
          WHERE Grupo = @nombre OR Grupo LIKE @nombreLike
          ORDER BY Nombre
        `)
      ).recordset
      for (const row of expanded) {
        resolved.set(String(row.idtaller).toLowerCase(), {
          idtaller: String(row.idtaller).toLowerCase(),
          nombre: row.nombre ?? '',
          grupo: row.grupo ?? null,
        })
      }
      if (expanded.length) via = 'grupo'
    }

    const shouldExpandSingleGrupo =
      expandGrupo &&
      grupos.length === 1 &&
      (via === 'nombre' || (missing.length > 0 && ids.length > 0))

    if (shouldExpandSingleGrupo && grupos[0]) {
      const request = pool.request()
      request.input('grupo', sql.NVarChar, grupos[0])
      const expanded = (
        await request.query(`
          SELECT LOWER(CAST(IDTaller AS NVARCHAR(36))) AS idtaller, Nombre AS nombre,
                 NULLIF(LTRIM(RTRIM(Grupo)), '') AS grupo
          FROM Talleres
          WHERE Grupo = @grupo
          ORDER BY Nombre
        `)
      ).recordset
      for (const row of expanded) {
        resolved.set(String(row.idtaller).toLowerCase(), {
          idtaller: String(row.idtaller).toLowerCase(),
          nombre: row.nombre ?? '',
          grupo: row.grupo ?? null,
        })
      }
      via = 'grupo'
    }

    const talleres = [...resolved.values()]
    res.json({
      ids: talleres.map((t) => t.idtaller),
      talleres: talleres.map(({ idtaller, nombre: n }) => ({ idtaller, nombre: n })),
      via,
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.get('/api/tipos-peticion', async (_req, res) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query(`
      SELECT IDTipoPeticion AS idtipopeticion, TipoPeticion AS tipopeticion
      FROM ChatBotTipoPeticiones
      ORDER BY TipoPeticion
    `)
    res.json(result.recordset)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.get('/api/peticiones-pendientes', async (req, res) => {
  try {
    const pool = await getPool()
    const rawIds = req.query.idTaller
    const ids = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
      .map((id) => String(id).trim().toLowerCase())
      .filter(Boolean)

    if (!ids.length) {
      res.status(400).json({ error: 'Parámetro idTaller requerido (UUID)' })
      return
    }

    const caller = req.query.caller ? String(req.query.caller).trim() : ''
    const tipoPeticionId = req.query.tipoPeticionId ? Number(req.query.tipoPeticionId) : null
    const soloConCita = req.query.soloConCita === 'true' || req.query.soloConCita === '1'

    const request = pool.request()
    const inParams = ids.map((id, i) => {
      request.input(`id${i}`, sql.UniqueIdentifier, id)
      return `@id${i}`
    })

    let sqlText = `
      SELECT
        p.IDPeticion, p.IDTaller, p.Descripcion, p.IDTipoPeticion,
        p.FechaInicio, p.FechaFin, p.FechaCreacion, p.Caller,
        p.Gestionado, p.GestionEmail, p.GestionFecha, p.GestionObservaciones, p.IDCita,
        tp.TipoPeticion,
        c.Fecha AS CitaFecha, c.Nombre, c.Apellidos, c.Telefono, c.Movil, c.Email,
        c.Matricula, c.Marca, c.Modelo, c.Asunto
      FROM ChatBotPeticiones p
      INNER JOIN ChatBotTipoPeticiones tp ON p.IDTipoPeticion = tp.IDTipoPeticion
      LEFT JOIN Citas c ON p.IDCita = c.IDCita
      WHERE p.IDTaller IN (${inParams.join(', ')})
    `

    // Filtros opcionales (la consulta base del negocio solo usa IDTaller + Caller)
    const soloSesionAbierta = req.query.soloSesionAbierta === 'true' || req.query.soloSesionAbierta === '1'
    const soloNoGestionadas = req.query.soloNoGestionadas === 'true' || req.query.soloNoGestionadas === '1'

    if (soloSesionAbierta) {
      sqlText += ' AND p.FechaFin IS NULL'
    }
    if (soloNoGestionadas) {
      sqlText += ' AND (p.Gestionado = 0 OR p.Gestionado IS NULL)'
    }

    if (caller) {
      request.input('caller', sql.NVarChar, `%${caller}%`)
      sqlText += ' AND p.Caller LIKE @caller'
    }

    if (tipoPeticionId != null && !Number.isNaN(tipoPeticionId)) {
      request.input('tipoPeticionId', sql.Int, tipoPeticionId)
      sqlText += ' AND p.IDTipoPeticion = @tipoPeticionId'
    }

    if (soloConCita) {
      sqlText += ' AND p.IDCita IS NOT NULL'
    }

    sqlText += ' ORDER BY p.FechaInicio DESC'

    const result = await request.query(sqlText)
    res.json(result.recordset.map(mapRow))
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.patch('/api/peticiones/:id/gestion', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) {
      res.status(400).json({ error: 'ID petición requerido' })
      return
    }

    const gestionado = Boolean(req.body?.gestionado)
    const gestionobservaciones = String(req.body?.gestionobservaciones ?? '')
    const gestionemail = String(req.body?.gestionemail ?? '')

    const pool = await getPool()
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .input('gestionado', sql.Bit, gestionado ? 1 : 0)
      .input('obs', sql.NVarChar, gestionobservaciones)
      .input('email', sql.NVarChar, gestionemail)
      .query(`
        UPDATE ChatBotPeticiones
        SET Gestionado = @gestionado,
            GestionObservaciones = @obs,
            GestionEmail = @email,
            GestionFecha = CASE WHEN @gestionado = 1 THEN GETDATE() ELSE NULL END,
            FechaModificacion = GETDATE()
        WHERE IDPeticion = @id
      `)

    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

const server = app.listen(PORT, () => {
  console.log(`API SQL Server escuchando en http://localhost:${PORT}`)
  console.log(`  BD: ${process.env.MSSQL_HOST || '82.223.37.171'} / ${process.env.MSSQL_DATABASE || 'CRMTaller'}`)
})

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `\nPuerto ${PORT} ya en uso. La API probablemente ya está corriendo.\n` +
        `  → Prueba http://localhost:${PORT}/api/health\n` +
        `  → Para reiniciar: npm run stop:api  y luego  npm run dev:api\n`,
    )
    process.exit(1)
  }
  throw err
})
