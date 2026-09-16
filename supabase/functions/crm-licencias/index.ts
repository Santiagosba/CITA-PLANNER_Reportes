import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPER_EMAILS = new Set(["santy@gmail.com", "noel.ponce@avicrm.es"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const KNOWN_VIEWS = new Set([
  "dashboard-general",
  "boards",
  "pending-citas",
  "equipos",
  "asignar-tarea",
  "tareas-hoy",
  "stats-equipo",
  "gasto-ia",
  "laura",
  "bot-identity",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function uuidList(raw: unknown): string[] {
  const out = new Set<string>();
  const list = Array.isArray(raw) ? raw : [];
  for (const item of list) {
    if (isUuid(String(item))) out.add(String(item).trim().toLowerCase());
  }
  return [...out];
}

function idList(raw: unknown): string[] {
  const out = new Set<string>();
  const list = Array.isArray(raw) ? raw : [];
  for (const item of list) {
    const value = String(item || "").trim();
    if (!value) continue;
    out.add(isUuid(value) ? value.toLowerCase() : value);
  }
  return [...out];
}

async function findUserIdByEmail(
  auth: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  let page = 1;
  while (page <= 50) {
    const { data, error } = await auth.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = (data.users || []).find((user) => normEmail(user.email) === email);
    if (found?.id) return found.id;
    if ((data.users?.length || 0) < 200) break;
    page += 1;
  }
  return null;
}

function parseViews(raw: unknown): string[] | null {
  if (raw == null) return null;
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { routes?: unknown }).routes)
      ? (raw as { routes: unknown[] }).routes
      : null;
  if (!list) return null;
  return list.map((item) => String(item || "").trim()).filter((item) => KNOWN_VIEWS.has(item));
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

  const callerEmail = normEmail(callerData.user.email);
  const callerAppRole = appRoleOf((callerData.user.app_metadata || {}) as Record<string, unknown>);
  if (!isSuperCaller(callerEmail, callerAppRole)) {
    return json(403, { error: "Solo el super admin puede gestionar licencias." });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON inválido." });
  }

  const action = String(body.action || "list").trim();
  const webId = isUuid(body.webId) ? String(body.webId).toLowerCase() : null;
  if (!webId) return json(400, { error: "Falta la web de este CRM." });

  try {
    if (action === "list") {
      const containers = await fetchAll<{
        idtaller: string;
        nombre_personalizado: string | null;
        slug: string | null;
        idlicenciagrupo: number | string | null;
      }>((start, end) =>
        ops.from("talleres_accesibles").select("idtaller, nombre_personalizado, slug, idlicenciagrupo").range(start, end),
      );
      const groups = await fetchAll<{ idlicenciagrupo: number | string; nombre: string | null; activo: boolean | null }>(
        (start, end) => aviold.from("licencias_grupo").select("idlicenciagrupo, nombre, activo").range(start, end),
      );
      const links = await fetchAll<{ idlicenciagrupo: number | string; idtaller: string }>((start, end) =>
        aviold.from("licencias_grupo_taller").select("idlicenciagrupo, idtaller").range(start, end),
      );
      const tallerIds = [...new Set(links.map((row) => String(row.idtaller)))];
      const talleres: Array<{ idtaller: string; nombre: string | null; poblacion: string | null }> = [];
      const centros: Array<{ idcentro: string; idtaller: string; nombre: string | null; poblacion: string | null }> = [];
      for (let i = 0; i < tallerIds.length; i += 80) {
        const chunk = tallerIds.slice(i, i + 80);
        const { data, error } = await aviold.from("talleres").select("idtaller, nombre, poblacion").in("idtaller", chunk);
        if (error) throw new Error(error.message);
        talleres.push(...((data || []) as Array<{ idtaller: string; nombre: string | null; poblacion: string | null }>));
        const pageCentros = await fetchAll<{
          idcentro: string;
          idtaller: string;
          nombre: string | null;
          poblacion: string | null;
        }>((start, end) =>
          aviold
            .from("centros")
            .select("idcentro, idtaller, nombre, poblacion")
            .in("idtaller", chunk)
            .is("fechabaja", null)
            .range(start, end),
        );
        centros.push(...pageCentros);
      }
      const flags = await fetchAll<{ idlicenciagrupo: number | string; idtaller: string; activo: boolean | null }>(
        (start, end) =>
          ops
            .from("licencia_modulo_taller")
            .select("idlicenciagrupo, idtaller, activo")
            .eq("web_id", webId)
            .range(start, end),
      );
      const activeRows = await fetchAll<{ idtaller: string }>((start, end) =>
        ops.from("taller_web_activo").select("idtaller").eq("web_id", webId).range(start, end),
      );
      const viewRows = await fetchAll<{ idtaller: string; config_value: unknown }>((start, end) =>
        ops.from("crm_config").select("idtaller, config_value").eq("config_key", "crm_views").range(start, end),
      );
      const containerIds = containers.map((row) => String(row.idtaller));
      const members: Array<{ idtaller: string; user_id: string; role: string | null }> = [];
      for (let i = 0; i < containerIds.length; i += 80) {
        const chunk = containerIds.slice(i, i + 80);
        const { data, error } = await ops
          .from("taller_users")
          .select("idtaller, user_id, role")
          .in("idtaller", chunk);
        if (error) throw new Error(error.message);
        members.push(...((data || []) as Array<{ idtaller: string; user_id: string; role: string | null }>));
      }
      const adminMembers = members.filter((row) => {
        const role = String(row.role || "").toLowerCase();
        return role === "admin" || role === "aviadmin";
      });
      const userIds = [...new Set(adminMembers.map((row) => row.user_id))];
      const users = new Map<string, { email: string; name: string }>();
      for (const userId of userIds) {
        const { data } = await auth.auth.admin.getUserById(userId);
        const user = data?.user;
        if (!user) continue;
        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        users.set(userId, {
          email: normEmail(user.email),
          name: String(meta.full_name || meta.name || user.email || "").trim(),
        });
      }

      const groupName = new Map<string, { nombre: string; activo: boolean }>();
      for (const row of groups) {
        groupName.set(String(row.idlicenciagrupo), {
          nombre: String(row.nombre || "").trim() || `Licencia ${row.idlicenciagrupo}`,
          activo: row.activo !== false,
        });
      }
      const tallerName = new Map<string, { nombre: string; poblacion: string | null }>();
      for (const row of talleres) {
        tallerName.set(String(row.idtaller), {
          nombre: String(row.nombre || "").trim() || "Taller",
          poblacion: row.poblacion ? String(row.poblacion) : null,
        });
      }
      const flagKey = new Map<string, boolean>();
      for (const row of flags) {
        flagKey.set(`${row.idlicenciagrupo}:${row.idtaller}`, row.activo !== false);
      }
      const centrosByTaller = new Map<string, Array<{ idcentro: string; nombre: string; poblacion: string | null }>>();
      for (const row of centros) {
        const idtaller = String(row.idtaller);
        const list = centrosByTaller.get(idtaller) || [];
        list.push({
          idcentro: String(row.idcentro),
          nombre: String(row.nombre || "").trim() || "Centro",
          poblacion: row.poblacion ? String(row.poblacion) : null,
        });
        centrosByTaller.set(idtaller, list);
      }
      const workshopsByGroup = new Map<
        string,
        Array<{
          idtaller: string;
          nombre: string;
          activo: boolean;
          poblacion: string | null;
          centros: Array<{ idcentro: string; nombre: string; poblacion: string | null }>;
        }>
      >();
      for (const row of links) {
        const group = String(row.idlicenciagrupo);
        const idtaller = String(row.idtaller);
        const info = tallerName.get(idtaller) || { nombre: "Licencia", poblacion: null };
        const list = workshopsByGroup.get(group) || [];
        const shopCentros = [...(centrosByTaller.get(idtaller) || [])];
        shopCentros.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
        list.push({
          idtaller,
          nombre: info.nombre,
          activo: flagKey.has(`${group}:${idtaller}`) ? Boolean(flagKey.get(`${group}:${idtaller}`)) : true,
          poblacion: info.poblacion,
          centros: shopCentros,
        });
        workshopsByGroup.set(group, list);
      }
      const activeSet = new Set(activeRows.map((row) => String(row.idtaller)));
      const viewsByContainer = new Map<string, string[] | null>();
      for (const row of viewRows) {
        viewsByContainer.set(String(row.idtaller), parseViews(row.config_value));
      }
      const adminsByContainer = new Map<string, Array<{ name: string; email: string; role: string }>>();
      for (const row of adminMembers) {
        const user = users.get(row.user_id);
        if (!user?.email) continue;
        const list = adminsByContainer.get(String(row.idtaller)) || [];
        list.push({ name: user.name || user.email, email: user.email, role: String(row.role || "admin") });
        adminsByContainer.set(String(row.idtaller), list);
      }

      const licenses = containers
        .map((row) => {
          const containerId = String(row.idtaller);
          const groupId = row.idlicenciagrupo == null || String(row.idlicenciagrupo).trim() === ""
            ? null
            : String(row.idlicenciagrupo);
          const group = groupId ? groupName.get(groupId) : null;
          const workshops = (groupId ? workshopsByGroup.get(groupId) : null) || [];
          workshops.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
          return {
            idlicenciagrupo: groupId,
            nombre: String(row.nombre_personalizado || group?.nombre || row.slug || "Licencia").trim(),
            slug: row.slug ? String(row.slug) : null,
            containerId,
            grupoActivo: group ? group.activo : true,
            crmActivo: activeSet.has(containerId),
            views: viewsByContainer.get(containerId) ?? null,
            workshops,
            admins: adminsByContainer.get(containerId) || [],
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

      return json(200, { ok: true, licenses });
    }

    if (action === "set-active") {
      const containerId = isUuid(body.containerId) ? String(body.containerId).toLowerCase() : null;
      if (!containerId) return json(400, { error: "Falta la licencia." });
      const active = body.active !== false;
      if (active) {
        const { error } = await ops.from("taller_web_activo").upsert(
          { idtaller: containerId, web_id: webId },
          { onConflict: "idtaller,web_id" },
        );
        if (error) return json(400, { error: error.message });
      } else {
        const { error } = await ops.from("taller_web_activo").delete().eq("idtaller", containerId).eq("web_id", webId);
        if (error) return json(400, { error: error.message });
      }
      return json(200, { ok: true, action, containerId, active });
    }

    if (action === "set-views") {
      const containerId = isUuid(body.containerId) ? String(body.containerId).toLowerCase() : null;
      if (!containerId) return json(400, { error: "Falta la licencia." });
      const views = parseViews(body.views) ?? [];
      const now = new Date().toISOString();
      const { error } = await ops.from("crm_config").upsert(
        {
          idtaller: containerId,
          config_key: "crm_views",
          config_value: { routes: views },
          updated_at: now,
        },
        { onConflict: "idtaller,config_key" },
      );
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true, action, containerId, views });
    }

    if (action === "set-workshop") {
      const idtaller = isUuid(body.idtaller) ? String(body.idtaller).toLowerCase() : null;
      const groupRaw = String(body.idlicenciagrupo || "").trim();
      if (!idtaller || !groupRaw) return json(400, { error: "Falta el taller de la licencia." });
      const { error } = await ops.from("licencia_modulo_taller").upsert(
        {
          idlicenciagrupo: Number(groupRaw),
          web_id: webId,
          idtaller,
          activo: body.active !== false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "idlicenciagrupo,web_id,idtaller" },
      );
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true, action, idtaller, active: body.active !== false });
    }

    if (action === "list-users") {
      const containers = await fetchAll<{ idtaller: string }>((start, end) =>
        ops.from("talleres_accesibles").select("idtaller").range(start, end),
      );
      const containerIds = containers.map((row) => String(row.idtaller));
      const members: Array<{ idtaller: string; user_id: string; role: string | null }> = [];
      for (let i = 0; i < containerIds.length; i += 80) {
        const chunk = containerIds.slice(i, i + 80);
        const { data, error } = await ops
          .from("taller_users")
          .select("idtaller, user_id, role")
          .in("idtaller", chunk);
        if (error) throw new Error(error.message);
        members.push(...((data || []) as Array<{ idtaller: string; user_id: string; role: string | null }>));
      }
      const byUser = new Map<string, Set<string>>();
      for (const row of members) {
        const list = byUser.get(row.user_id) || new Set<string>();
        list.add(String(row.idtaller));
        byUser.set(row.user_id, list);
      }
      const users = [];
      for (const [userId, groupIds] of byUser) {
        const { data } = await auth.auth.admin.getUserById(userId);
        const user = data?.user;
        if (!user?.email) continue;
        const appMeta = (user.app_metadata || {}) as Record<string, unknown>;
        const userMeta = (user.user_metadata || {}) as Record<string, unknown>;
        const role = appRoleOf(appMeta);
        if (role === "aviadmin" || SUPER_EMAILS.has(normEmail(user.email))) continue;
        users.push({
          id: userId,
          email: normEmail(user.email),
          name: String(userMeta.full_name || userMeta.name || user.email || "").trim(),
          role: role === "taller_admin" ? "taller_admin" : "asesor",
          groupIds: [...groupIds],
          licenseIds: uuidList(appMeta.crm_idtalleres),
          centerIds: idList(appMeta.crm_idcentros),
        });
      }
      users.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }) || a.email.localeCompare(b.email));
      return json(200, { ok: true, users });
    }

    if (action === "set-user-access") {
      const email = normEmail(body.email);
      if (!email.includes("@")) return json(400, { error: "Indica el correo de la cuenta." });
      if (SUPER_EMAILS.has(email)) return json(403, { error: "Esa cuenta es de super admin. No se toca." });
      const groupIds = uuidList(body.groupIds);
      const licenseIds = uuidList(body.licenseIds);
      const centerIds = idList(body.centerIds);
      const displayName = String(body.name || "").trim();
      const password = String(body.password || "");
      const requestedRole = String(body.role || "").trim().toLowerCase() === "taller_admin" ? "taller_admin" : "asesor";
      const containers = await fetchAll<{ idtaller: string }>((start, end) =>
        ops.from("talleres_accesibles").select("idtaller").range(start, end),
      );
      const containerSet = new Set(containers.map((row) => String(row.idtaller).toLowerCase()));
      const wantedGroups = groupIds.filter((id) => containerSet.has(id));

      let userId = await findUserIdByEmail(auth, email);
      if (!userId) {
        if (password.length < 8) return json(400, { error: "Para crear la cuenta, la contraseña debe tener 8 caracteres." });
        const { data: createdUser, error } = await auth.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: {
            role: requestedRole,
            crm_idtalleres: licenseIds,
            crm_idcentros: centerIds,
            connect_site_ids: [webId],
          },
          user_metadata: displayName ? { full_name: displayName } : {},
        });
        if (error || !createdUser.user) return json(400, { error: error?.message || "No se pudo crear la cuenta." });
        userId = createdUser.user.id;
      } else {
        const { data: existing } = await auth.auth.admin.getUserById(userId);
        const currentApp = { ...((existing?.user?.app_metadata || {}) as Record<string, unknown>) };
        const currentUser = { ...((existing?.user?.user_metadata || {}) as Record<string, unknown>) };
        if (appRoleOf(currentApp) === "aviadmin") {
          return json(403, { error: "Esa cuenta es de super admin. No se toca." });
        }
        const sites = new Set(uuidList(currentApp.connect_site_ids));
        sites.add(webId);
        const next: Record<string, unknown> = {
          ...currentApp,
          role: requestedRole,
          crm_idtalleres: licenseIds,
          crm_idcentros: centerIds,
          connect_site_ids: [...sites],
        };
        const patch: { app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown>; password?: string } = {
          app_metadata: next,
          user_metadata: {
            ...currentUser,
            ...(displayName ? { full_name: displayName } : {}),
          },
        };
        if (password.length >= 8) patch.password = password;
        const { error } = await auth.auth.admin.updateUserById(userId, patch);
        if (error) return json(400, { error: error.message });
      }

      const { data: currentMembers, error: memberReadError } = await ops
        .from("taller_users")
        .select("idtaller")
        .eq("user_id", userId);
      if (memberReadError) return json(400, { error: memberReadError.message });
      const currentGroups = new Set(
        ((currentMembers || []) as Array<{ idtaller: string }>)
          .map((row) => String(row.idtaller).toLowerCase())
          .filter((id) => containerSet.has(id)),
      );
      const wanted = new Set(wantedGroups);
      for (const id of currentGroups) {
        if (wanted.has(id)) continue;
        const { error } = await ops.from("taller_users").delete().eq("user_id", userId).eq("idtaller", id);
        if (error) return json(400, { error: error.message });
      }
      const membershipRole = requestedRole === "taller_admin" ? "admin" : "user";
      for (const id of wanted) {
        const { error } = await ops.from("taller_users").upsert(
          { idtaller: id, user_id: userId, role: membershipRole, updated_at: new Date().toISOString() },
          { onConflict: "idtaller,user_id" },
        );
        if (error) return json(400, { error: error.message });
      }
      await ops.rpc("hub_rebuild_allowlist_from_memberships", { p_uid: userId }).then(() => null, () => null);
      return json(200, {
        ok: true,
        action,
        email,
        role: requestedRole,
        groupIds: wantedGroups,
        licenseIds,
        centerIds,
      });
    }

    return json(400, { error: `Acción desconocida: ${action}` });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "No se pudo completar." });
  }
});
