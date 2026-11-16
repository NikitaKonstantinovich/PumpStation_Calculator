export const PUMP_FILE_KINDS = ["image", "drawing", "model"] as const;
export type PumpFileKind = typeof PUMP_FILE_KINDS[number];
export type PumpFileReference = { id: string; kind: PumpFileKind; name: string; size: number; contentType: string; url: string };
export const PUMP_FILE_SETTINGS = {
  image: { label: "Изображение насоса", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"], maxBytes: 20 * 1024 * 1024 },
  drawing: { label: "Чертёж", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "pdf", "dwg", "dxf"], maxBytes: 30 * 1024 * 1024 },
  model: { label: "3D-модель", extensions: ["step", "stp", "stl", "iges", "igs", "sldprt", "sldasm", "x_t", "x_b", "obj", "glb", "gltf", "eprt", "easm"], maxBytes: 100 * 1024 * 1024 },
} as const;
export const pumpFilePathKey = (kind: PumpFileKind) => `${kind}Path` as "imagePath" | "drawingPath" | "modelPath";
export const pumpFileUrl = (id: string) => `/api/pumps/files/${id}`;
export const validPumpFileId = (id: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
export class PumpFileError extends Error { constructor(message: string, public status = 400) { super(message); } }

export function pumpFileDescription(kind: PumpFileKind) {
  const setting = PUMP_FILE_SETTINGS[kind];
  return `${setting.extensions.map(ext => ext.toUpperCase()).join(", ")} · до ${setting.maxBytes / 1024 / 1024} МБ`;
}
export function checkPumpFile(kind: PumpFileKind, name: string, size: number) {
  const setting = PUMP_FILE_SETTINGS[kind], extension = name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!name || name.length > 240 || [...name].some(char => char.charCodeAt(0) < 32)) throw new PumpFileError("Некорректное имя файла.");
  if (!(setting.extensions as readonly string[]).includes(extension)) throw new PumpFileError(`Недопустимый формат. ${pumpFileDescription(kind)}.`);
  if (!Number.isSafeInteger(size) || size <= 0) throw new PumpFileError("Файл пуст или имеет некорректный размер.");
  if (size > setting.maxBytes) throw new PumpFileError(`Максимальный размер файла — ${setting.maxBytes / 1024 / 1024} МБ.`, 413);
  const types: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", pdf: "application/pdf" };
  return { extension, contentType: types[extension] ?? "application/octet-stream" };
}

export function checkedPumpFileStream(body: ReadableStream<Uint8Array>, size: number, extension: string) {
  let received = 0, prefix = new Uint8Array(0), checked = false;
  const check = () => {
    const text = new TextDecoder("ascii").decode(prefix);
    const valid = extension === "png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => prefix[index] === value)
      : ["jpg", "jpeg"].includes(extension) ? prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255
      : extension === "gif" ? /^GIF8[79]a/.test(text)
      : extension === "webp" ? text.startsWith("RIFF") && text.slice(8, 12) === "WEBP"
      : extension === "bmp" ? text.startsWith("BM")
      : extension === "pdf" ? text.startsWith("%PDF-") : true;
    if (!valid) throw new PumpFileError("Содержимое файла не соответствует его расширению.");
    checked = true;
  };
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > size) throw new PumpFileError("Размер загруженного файла превышает заявленный.", 413);
      if (!checked) {
        const next = new Uint8Array(Math.min(16, prefix.length + chunk.length)); next.set(prefix); next.set(chunk.subarray(0, next.length - prefix.length), prefix.length); prefix = next;
        if (prefix.length >= Math.min(16, size)) check();
      }
      controller.enqueue(chunk);
    },
    flush() { if (received !== size) throw new PumpFileError("Загрузка файла не завершена. Повторите попытку."); if (!checked) check(); },
  }));
}
