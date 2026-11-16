export const REQUEST_NUMBER_MESSAGE = "Номер запроса: вводите цифры, разделённые тире, например 123-1234-1.";
export function validRequestNumber(value: unknown): value is string {
  return typeof value === "string" && /^(?:[0-9]+(?:-[0-9]+)*)?$/.test(value);
}
