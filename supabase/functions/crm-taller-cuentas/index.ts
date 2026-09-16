import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPER_EMAILS = new Set(["santy@gmail.com", "noel.ponce@avicrm.es"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function isSuperCaller(email: string, appRole: string, userRole: string): boolean {
  if (SUPER_EMAILS.has(email)) return true;
  return appRole === "aviadmin" || userRole === "aviadmin";
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

function mergeIds(existing: unknown, nextId: string | null): string[] {
  const ids = new Set<string>();
  const raw = Array.isArray(existing) ? existing : [];
  for (const item of raw) {
    if (isUuid(String(item))) ids.add(String(item).toLowerCase());
  }
  if (nextId && isUuid(nextId)) ids.add(nextId.toLowerCase());
  return [...ids];
}

function mergeIdList(existing: unknown, extra: unknown): string[] {
  let ids = mergeIds(existing, isUuid(extra) ? String(extra) : null);
  const raw = Array.isArray(extra) ? extra : [];
  for (const item of raw) ids = mergeIds(ids, isUuid(item) ? String(item) : null);
  return ids;
}

function mergeConnectSites(
  appMeta: Record<string, unknown>,
  userMeta: Record<string, unknown>,
  hubWebId: string | null,
): string[] {
  const fromApp = Array.isArray(appMeta.connect_site_ids) ? appMeta.connect_site_ids : [];
  const fromUser = Array.isArray(userMeta.connect_site_ids) ? userMeta.connect_site_ids : [];
  return mergeIds([...fromApp, ...fromUser], hubWebId);
}

function withoutId(existing: unknown, removeId: string | null): string[] {
  if (!removeId) return mergeIds(existing, null);
  return mergeIds(existing, null).filter((id) => id !== removeId.toLowerCase());
}

async function stripWorkspace(
  ops: ReturnType<typeof createClient>,
  email: string,
  onlyIdtaller?: string | null,
) {
  let query = ops.from("crm_advisor_workspace").select("idtaller, workspace");
  if (onlyIdtaller) query = query.eq("idtaller", onlyIdtaller);
  const { data, error } = await query;
  if (error || !data) return;
  for (const row of data as Array<{ idtaller: string; workspace: Record<string, unknown> | null }>) {
    const workspace = row.workspace;
    const people = Array.isArray(workspace?.people) ? workspace.people as Array<{ id?: string; email?: string }> : [];
    const person = people.find((item) => normEmail(item.email) === email);
    if (!person) continue;
    const personId = String(person.id || "");
    const next = {
      ...workspace,
      people: people.filter((item) => normEmail(item.email) !== email),
      teams: Array.isArray(workspace?.teams)
        ? (workspace.teams as Array<{ memberIds?: string[] }>).map((team) => ({
            ...team,
            memberIds: Array.isArray(team.memberIds) ? team.memberIds.filter((id) => id !== personId) : team.memberIds,
          }))
        : workspace?.teams,
      tasks: Array.isArray(workspace?.tasks)
        ? (workspace.tasks as Array<{ assigneeId?: string }>).map((task) =>
            task.assigneeId === personId ? { ...task, assigneeId: "" } : task,
          )
        : workspace?.tasks,
    };
    await ops.from("crm_advisor_workspace").update({ workspace: next, updated_at: new Date().toISOString() }).eq(
      "idtaller",
      row.idtaller,
    );
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
  if (!token) return json(401, { error: "Entra con tu correo y contraseña. «Entrar como admin» no vale para crear cuentas." });

  const auth = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ops = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "operations" },
  });

  const { data: callerData, error: callerErr } = await auth.auth.getUser(token);
  if (callerErr || !callerData.user) return json(401, { error: "Tu sesión no vale. Vuelve a entrar." });

  const caller = callerData.user;
  const callerEmail = normEmail(caller.email);
  const callerAppRole = appRoleOf((caller.app_metadata || {}) as Record<string, unknown>);
  const callerUserRole = appRoleOf((caller.user_metadata || {}) as Record<string, unknown>);
  const isSuper = isSuperCaller(callerEmail, callerAppRole, callerUserRole);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON inválido." });
  }

  const action = String(body.action || "password").trim();
  const email = normEmail(body.email);
  const idtaller = isUuid(body.idtaller) ? String(body.idtaller).toLowerCase() : null;
  const crmIdtaller = isUuid(body.crmIdtaller) ? String(body.crmIdtaller).toLowerCase() : idtaller;
  const crmIdtalleres = mergeIdList(body.crmIdtalleres, crmIdtaller);
  const hubWebId = isUuid(body.hubWebId) ? String(body.hubWebId).toLowerCase() : null;
  const hasRole = body.role != null && String(body.role).trim() !== "";
  const requestedRole = String(body.role || "asesor").trim().toLowerCase() === "taller_admin"
    ? "taller_admin"
    : "asesor";

  if (!email.includes("@")) return json(400, { error: "Indica el correo de la cuenta." });

  if (!isSuper) {
    if (!idtaller) return json(400, { error: "Falta el taller." });
    const { data: membership } = await ops
      .from("taller_users")
      .select("role")
      .eq("idtaller", idtaller)
      .eq("user_id", caller.id)
      .maybeSingle();
    const role = String(membership?.role || "").trim().toLowerCase();
    if (role !== "admin" && role !== "aviadmin") {
      return json(403, { error: "Solo el admin de este taller puede crear o quitar cuentas." });
    }
    if (action === "delete" || requestedRole === "taller_admin") {
      return json(403, { error: "Solo el super admin puede crear otro admin o borrar una cuenta del todo." });
    }
  }

  if (email === callerEmail && action !== "password") {
    return json(403, { error: "No puedes quitarte o borrarte a ti mismo." });
  }
  if (SUPER_EMAILS.has(email) && action !== "password") {
    return json(403, { error: "Esa cuenta es de super admin. No se toca." });
  }

  try {
    if (action === "password") {
      const password = String(body.password || "");
      if (password.length < 8) return json(400, { error: "La contraseña debe tener al menos 8 caracteres." });
      const displayName = String(body.name || "").trim();
      let userId = await findUserIdByEmail(auth, email);
      let created = false;
      let appliedRole = requestedRole;

      if (!userId) {
        const connectSites = mergeConnectSites({}, {}, hubWebId);
        const { data: createdUser, error } = await auth.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: {
            role: requestedRole,
            ...(crmIdtalleres.length ? { crm_idtalleres: crmIdtalleres } : {}),
            ...(connectSites.length ? { connect_site_ids: connectSites } : {}),
          },
          user_metadata: displayName ? { full_name: displayName } : {},
        });
        if (error || !createdUser.user) return json(400, { error: error?.message || "No se pudo crear la cuenta." });
        userId = createdUser.user.id;
        created = true;
      } else {
        const { data: existing } = await auth.auth.admin.getUserById(userId);
        const currentApp = { ...((existing?.user?.app_metadata || {}) as Record<string, unknown>) };
        const currentUser = { ...((existing?.user?.user_metadata || {}) as Record<string, unknown>) };
        const currentRole = appRoleOf(currentApp);
        if (currentRole === "aviadmin") {
          return json(403, { error: "Esa cuenta es de super admin. No se puede convertir." });
        }
        const nextRole = hasRole
          ? requestedRole
          : currentRole === "taller_admin" || currentRole === "asesor"
            ? currentRole
            : requestedRole;
        appliedRole = nextRole;
        const connectSites = mergeConnectSites(currentApp, currentUser, hubWebId);
        const { error } = await auth.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          app_metadata: {
            ...currentApp,
            role: nextRole,
            crm_idtalleres: mergeIdList(currentApp.crm_idtalleres, crmIdtalleres),
            ...(connectSites.length ? { connect_site_ids: connectSites } : {}),
          },
          user_metadata: {
            ...currentUser,
            ...(displayName ? { full_name: displayName } : {}),
          },
        });
        if (error) return json(400, { error: error.message });
      }

      if (idtaller) {
        const membershipRole = appliedRole === "taller_admin" ? "admin" : "user";
        const { error } = await ops.from("taller_users").upsert(
          { idtaller, user_id: userId, role: membershipRole, updated_at: new Date().toISOString() },
          { onConflict: "idtaller,user_id" },
        );
        if (error) return json(400, { error: error.message });
        await ops.rpc("hub_rebuild_allowlist_from_memberships", { p_uid: userId }).then(() => null, () => null);
      }
      return json(200, { ok: true, created, role: appliedRole, email });
    }

    if (action === "role") {
      if (!hasRole) return json(400, { error: "Indica si el rol es admin o asesor." });
      const userId = await findUserIdByEmail(auth, email);
      if (!userId) return json(404, { error: "Esa cuenta no existe. Créala primero." });
      const { data: existing } = await auth.auth.admin.getUserById(userId);
      const currentApp = { ...((existing?.user?.app_metadata || {}) as Record<string, unknown>) };
      const currentUser = { ...((existing?.user?.user_metadata || {}) as Record<string, unknown>) };
      const currentRole = appRoleOf(currentApp);
      if (currentRole === "aviadmin") {
        return json(403, { error: "Esa cuenta es de super admin. No se puede convertir." });
      }
      if (!isSuper && currentRole === "taller_admin") {
        return json(403, { error: "Solo el super admin puede quitar el rol de admin." });
      }
      const displayName = String(body.name || "").trim();
      const connectSites = mergeConnectSites(currentApp, currentUser, hubWebId);
      const { error } = await auth.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...currentApp,
          role: requestedRole,
          crm_idtalleres: mergeIdList(currentApp.crm_idtalleres, crmIdtalleres),
          ...(connectSites.length ? { connect_site_ids: connectSites } : {}),
        },
        user_metadata: {
          ...currentUser,
          ...(displayName ? { full_name: displayName } : {}),
        },
      });
      if (error) return json(400, { error: error.message });
      if (idtaller) {
        const membershipRole = requestedRole === "taller_admin" ? "admin" : "user";
        const { error: memberError } = await ops.from("taller_users").upsert(
          { idtaller, user_id: userId, role: membershipRole, updated_at: new Date().toISOString() },
          { onConflict: "idtaller,user_id" },
        );
        if (memberError) return json(400, { error: memberError.message });
        await ops.rpc("hub_rebuild_allowlist_from_memberships", { p_uid: userId }).then(() => null, () => null);
      }
      return json(200, { ok: true, action: "role", role: requestedRole, email });
    }

    if (action === "schedule-delete") {
      if (email.endsWith("@taller.demo")) {
        return json(403, { error: "Las cuentas de prueba no se borran. Sácala de este taller." });
      }
      const userId = await findUserIdByEmail(auth, email);
      if (!userId) return json(404, { error: "Esa cuenta no existe." });
      const { data: existing } = await auth.auth.admin.getUserById(userId);
      const currentApp = { ...((existing?.user?.app_metadata || {}) as Record<string, unknown>) };
      if (appRoleOf(currentApp) === "aviadmin") {
        return json(403, { error: "Esa cuenta es de super admin. No se toca." });
      }
      if (!isSuper && appRoleOf(currentApp) === "taller_admin") {
        return json(403, { error: "Solo el super admin puede programar el borrado de un admin." });
      }
      const deletedAt = new Date().toISOString();
      const purge = new Date();
      purge.setUTCDate(purge.getUTCDate() + 15);
      const purgeAt = purge.toISOString();
      const { error } = await auth.auth.admin.updateUserById(userId, {
        ban_duration: "360h",
        app_metadata: {
          ...currentApp,
          crm_deleted_at: deletedAt,
          crm_purge_at: purgeAt,
        },
      });
      if (error) return json(400, { error: error.message });
      await auth.auth.admin.signOut(userId, "global").catch(() => null);
      return json(200, { ok: true, action: "schedule-delete", email, deletedAt, purgeAt });
    }

    if (action === "restore") {
      const userId = await findUserIdByEmail(auth, email);
      if (!userId) return json(404, { error: "Esa cuenta no existe." });
      const { data: existing } = await auth.auth.admin.getUserById(userId);
      const currentApp = { ...((existing?.user?.app_metadata || {}) as Record<string, unknown>) };
      if (appRoleOf(currentApp) === "aviadmin") {
        return json(403, { error: "Esa cuenta es de super admin. No se toca." });
      }
      if (!isSuper && appRoleOf(currentApp) === "taller_admin") {
        return json(403, { error: "Solo el super admin puede restaurar a un admin." });
      }
      const nextApp = { ...currentApp };
      delete nextApp.crm_deleted_at;
      delete nextApp.crm_purge_at;
      const { error } = await auth.auth.admin.updateUserById(userId, {
        ban_duration: "none",
        app_metadata: nextApp,
      });
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true, action: "restore", email });
    }

    if (action === "revoke") {
      if (!idtaller) return json(400, { error: "Falta el taller." });
      const userId = await findUserIdByEmail(auth, email);
      if (userId) {
        const { data: existing } = await auth.auth.admin.getUserById(userId);
        const currentApp = { ...((existing?.user?.app_metadata || {}) as Record<string, unknown>) };
        if (appRoleOf(currentApp) === "aviadmin") {
          return json(403, { error: "Esa cuenta es de super admin. No se toca." });
        }
        await ops.from("taller_users").delete().eq("user_id", userId).eq("idtaller", idtaller);
        await auth.auth.admin.updateUserById(userId, {
          app_metadata: { ...currentApp, crm_idtalleres: withoutId(currentApp.crm_idtalleres, crmIdtaller) },
        });
        const { count } = await ops.from("taller_users").select("user_id", { count: "exact", head: true }).eq("user_id", userId);
        if ((count ?? 0) === 0) {
          await auth.auth.admin.signOut(userId, "global").catch(() => null);
        }
      }
      await stripWorkspace(ops, email, idtaller);
      return json(200, { ok: true, action: "revoke", email });
    }

    if (action === "delete") {
      if (!isSuper) return json(403, { error: "Solo el super admin puede borrar una cuenta." });
      if (email.endsWith("@taller.demo")) {
        return json(403, { error: "Las cuentas de prueba no se borran. Sácala de este taller." });
      }
      const userId = await findUserIdByEmail(auth, email);
      if (userId) {
        const { data: existing } = await auth.auth.admin.getUserById(userId);
        if (appRoleOf((existing?.user?.app_metadata || {}) as Record<string, unknown>) === "aviadmin") {
          return json(403, { error: "Esa cuenta es de super admin. No se toca." });
        }
        await auth.auth.admin.signOut(userId, "global").catch(() => null);
        await ops.from("taller_users").delete().eq("user_id", userId);
        await stripWorkspace(ops, email);
        const { error } = await auth.auth.admin.deleteUser(userId);
        if (error) return json(400, { error: error.message });
      } else {
        await stripWorkspace(ops, email, idtaller);
      }
      return json(200, { ok: true, action: "delete", email });
    }

    return json(400, { error: `Acción desconocida: ${action}` });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "No se pudo completar." });
  }
});
