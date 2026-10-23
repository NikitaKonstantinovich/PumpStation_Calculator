import { currentUser, json } from "../../auth-server";
import { readSavedInsertions, savedInsertionComponent } from "../../component-insert-store-server";

// The shared catalogue remains readable by ordinary signed-in users. Creation
// and calculation are confined to the separately protected admin endpoint.
export async function GET(request: Request) {
  try {
    if (!await currentUser(request)) return json({ error: "Требуется вход." }, 401, { "Cache-Control": "no-store" });
    return json({ items: (await readSavedInsertions()).map(savedInsertionComponent) }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("Saved component catalogue unavailable", error);
    return json({ error: "Не удалось загрузить сохранённые комплектующие. Проверьте миграцию 0008_component_insertions.sql." }, 503, { "Cache-Control": "no-store" });
  }
}
