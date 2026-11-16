import { json } from "./auth-server";
import { canUseGeometry, type AccountUser } from "./user-types";

export function geometryAccessError(user: AccountUser | null) {
  if (!user) return json({ error: "Требуется вход." }, 401, { "Cache-Control": "no-store" });
  return canUseGeometry(user.role) ? null : json({ error: "Расчёт геометрии доступен с уровня pro." }, 403, { "Cache-Control": "no-store" });
}
