import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPER_EMAILS = new Set(["santy@gmail.com", "noel.ponce@avicrm.es"]);
const ADMIN_ROLES = new Set(["admin", "aviadmin", "taller_admin", "jefe", "responsable"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE = 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CallRow = {
  id: string;
  fecha_inicio: string;
  fecha_respuesta: string | null;
  duracion_seg: number | null;
  coste: number | string | null;
  coste_moneda: string | null;
  recording_path: string | null;
  notas: string | null;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normEmail(raw: unknown): string {
  return String(raw || "").trim().toLowerCase();
}

function isUuid(raw: unknown): raw is string {
  return typeof raw === "string" && UUID_RE.test(raw.trim());
}

function appRoleOf(meta: Record<string, unknown> | undefined): string {
  return String(meta?.role ?? meta?.user_role ?? "").trim().toLowerCase();
}

function isSuperCaller(email: string, appRole: string): boolean {
  return SUPER_EMAILS.has(email) || appRole === "aviadmin";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function madridDay(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

async function fetchAll<T>(
  loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await loadPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) return all;
    from += PAGE;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(500, { error: "Falta configuración de Supabase." });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Entra con tu correo y contraseña." });

  const auth = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ops = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "operations" },
  });
  const aviold = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "aviold" },
  });

  const { data: callerData, error: callerErr } = await auth.auth.getUser(token);
  if (callerErr || !callerData.user) return json(401, { error: "Tu sesión no vale. Vuelve a entrar." });

  const caller = callerData.user;
  const callerEmail = normEmail(caller.email);
  const callerAppRole = appRoleOf((caller.app_metadata || {}) as Record<string, unknown>);
  const isSuper = isSuperCaller(callerEmail, callerAppRole);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON inválido." });
  }

  const idtaller = isUuid(body.idtaller) ? String(body.idtaller).trim().toLowerCase() : null;
  const extraTalleres = Array.isArray(body.idtalleres)
    ? body.idtalleres.filter((item) => isUuid(item)).map((item) => String(item).trim().toLowerCase())
    : [];
  const tallerIds = [...new Set([idtaller, ...extraTalleres].filter((item): item is string => Boolean(item)))];
  if (tallerIds.length === 0 && !isSuper) return json(400, { error: "Falta el taller." });

  const fromRaw = String(body.from || "").trim();
  const toRaw = String(body.to || "").trim();
  const to = toRaw && !Number.isNaN(Date.parse(toRaw)) ? new Date(toRaw) : new Date();
  const from = fromRaw && !Number.isNaN(Date.parse(fromRaw))
    ? new Date(fromRaw)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (!isSuper && tallerIds.length > 0) {
    const { data: memberships } = await ops
      .from("taller_users")
      .select("role")
      .eq("user_id", caller.id)
      .in("idtaller", tallerIds);
    const memberAdmin = (memberships || []).some((row) =>
      ADMIN_ROLES.has(String(row.role || "").trim().toLowerCase()),
    );
    if (!memberAdmin && !ADMIN_ROLES.has(callerAppRole)) {
      return json(403, { error: "Solo el admin del taller puede ver el gasto Telnyx." });
    }
  }

  const userIds = new Set<string>();
  if (UUID_RE.test(caller.id)) userIds.add(caller.id);

  if (tallerIds.length > 0) {
    const { data: members, error: memberErr } = await ops
      .from("taller_users")
      .select("user_id, legacy_idusuario")
      .in("idtaller", tallerIds);
    if (memberErr) return json(500, { error: memberErr.message });
    for (const row of members || []) {
      const userId = String(row.user_id || "").trim();
      const legacyId = String(row.legacy_idusuario || "").trim();
      if (UUID_RE.test(userId)) userIds.add(userId);
      if (UUID_RE.test(legacyId)) userIds.add(legacyId);
    }
  }

  const licenseGroups = new Set<number>();
  if (tallerIds.length > 0) {
    const { data: groups } = await aviold
      .from("licencias_grupo_taller")
      .select("idlicenciagrupo")
      .in("idtaller", tallerIds);
    for (const row of groups || []) {
      const group = Number(row.idlicenciagrupo);
      if (Number.isFinite(group) && group > 0) licenseGroups.add(group);
    }
    const { data: accesibles } = await ops
      .from("talleres_accesibles")
      .select("idlicenciagrupo")
      .in("idtaller", tallerIds);
    for (const row of accesibles || []) {
      const group = Number(row.idlicenciagrupo);
      if (Number.isFinite(group) && group > 0) licenseGroups.add(group);
    }
  }

  const select =
    "id, fecha_inicio, fecha_respuesta, duracion_seg, coste, coste_moneda, recording_path, notas";
  const byId = new Map<string, CallRow>();

  const addRows = (rows: CallRow[]) => {
    for (const row of rows) byId.set(row.id, row);
  };

  try {
    // AviAdmin: mismo alcance que api-crm `canAccessAllTenants` (todas las filas del periodo).
    if (isSuper) {
      addRows(
        await fetchAll((start, end) =>
          aviold
            .from("llamadas_softphone")
            .select(select)
            .gte("fecha_inicio", from.toISOString())
            .lt("fecha_inicio", to.toISOString())
            .order("fecha_inicio", { ascending: true })
            .range(start, end),
        ),
      );
    } else {
      for (const ids of chunk([...userIds], 80)) {
        addRows(
          await fetchAll((start, end) =>
            aviold
              .from("llamadas_softphone")
              .select(select)
              .gte("fecha_inicio", from.toISOString())
              .lt("fecha_inicio", to.toISOString())
              .in("idusuario", ids)
              .order("fecha_inicio", { ascending: true })
              .range(start, end),
          ),
        );
      }
      for (const groups of chunk([...licenseGroups], 80)) {
        addRows(
          await fetchAll((start, end) =>
            aviold
              .from("llamadas_softphone")
              .select(select)
              .gte("fecha_inicio", from.toISOString())
              .lt("fecha_inicio", to.toISOString())
              .in("idlicenciagrupo", groups)
              .order("fecha_inicio", { ascending: true })
              .range(start, end),
          ),
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron leer las llamadas.";
    return json(500, { error: message });
  }

  const rows = [...byId.values()];
  const seriesMap = new Map<string, { day: string; calls: number; cost: number; duration_sec: number }>();
  let duration = 0;
  let cost = 0;
  let answered = 0;
  let withCost = 0;
  let withRecording = 0;
  let withTranscript = 0;
  const currencies: Record<string, number> = {};

  for (const row of rows) {
    const day = madridDay(row.fecha_inicio);
    const rowCost = Number(row.coste) || 0;
    const rowDuration = Number(row.duracion_seg) || 0;
    duration += rowDuration;
    cost += rowCost;
    if (row.fecha_respuesta) answered += 1;
    if (row.coste != null && row.coste !== "") withCost += 1;
    if (row.recording_path) withRecording += 1;
    if (String(row.notas || "").toLowerCase().includes("transcrip")) withTranscript += 1;
    const currency = String(row.coste_moneda || "").trim();
    if (currency) currencies[currency] = (currencies[currency] || 0) + 1;
    const dayRow = seriesMap.get(day) ?? { day, calls: 0, cost: 0, duration_sec: 0 };
    dayRow.calls += 1;
    dayRow.cost += rowCost;
    dayRow.duration_sec += rowDuration;
    seriesMap.set(day, dayRow);
  }

  const currency = Object.entries(currencies).sort((a, b) => b[1] - a[1])[0]?.[0] || "USD";

  return json(200, {
    from: from.toISOString(),
    to: to.toISOString(),
    currency,
    calls: rows.length,
    answered,
    duration_sec: duration,
    cost,
    with_cost: withCost,
    with_recording: withRecording,
    with_transcript: withTranscript,
    series: [...seriesMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
  });
});
