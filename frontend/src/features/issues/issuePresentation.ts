import type {
  IssueStatus,
  IssueType,
  Priority,
  UserRef,
} from "../../api/types";
export const typeNames: Record<IssueType, string> = {
  QUESTION: "Domanda",
  BUG: "Bug",
  DOCUMENTATION: "Documentazione",
  FEATURE: "Funzionalità",
};
export const statusNames: Record<IssueStatus, string> = {
  TODO: "Da fare",
  IN_PROGRESS: "In corso",
  RESOLVED: "Risolta",
  DUPLICATE: "Duplicata",
};
export const priorityNames: Record<Priority, string> = {
  LOW: "Bassa",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Critica",
};
export const userName = (user: UserRef | null) =>
  user
    ? `${user.displayName}${user.active ? "" : " · Account non attivo"}`
    : "Nessuno";
export const dateOnly = (value: string | null) =>
  value ? value.split("-").reverse().join("/") : "Non impostata";
const dateTimeFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const dateTime = (value: string) =>
  dateTimeFormatter.format(new Date(value)).replace(",", "");
export const todayRome = () => dateFormatter.format(new Date());
export const normalized = (text: string) => text.normalize("NFC").trim();
export const codePoints = (text: string) => Array.from(text).length;
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function parseIssueQuery(params: URLSearchParams) {
  const arrays = {
    type: Object.keys(typeNames),
    status: Object.keys(statusNames),
    priority: Object.keys(priorityNames),
  };
  const allowed = new Set([
    "q",
    "type",
    "status",
    "priority",
    "labelId",
    "assignedTo",
    "reporterId",
    "overdue",
    "page",
    "size",
    "sort",
  ]);
  for (const key of params.keys())
    if (!allowed.has(key)) throw new Error(`Filtro non valido: ${key}.`);
  for (const [key, values] of Object.entries(arrays))
    if (params.getAll(key).some((value) => !values.includes(value)))
      throw new Error(`Filtro ${key} non valido.`);
  if (
    params.getAll("labelId").some((value) => !UUID.test(value)) ||
    params.getAll("labelId").length > 20
  )
    throw new Error("Etichette non valide.");
  for (const key of [
    "q",
    "assignedTo",
    "reporterId",
    "overdue",
    "page",
    "size",
    "sort",
  ])
    if (params.getAll(key).length > 1)
      throw new Error(`Filtro ${key} ripetuto.`);
  if (codePoints(normalized(params.get("q") ?? "")) > 100)
    throw new Error("La ricerca può contenere al massimo 100 caratteri.");
  const assigned = params.get("assignedTo");
  if (
    assigned &&
    !["me", "unassigned"].includes(assigned) &&
    !UUID.test(assigned)
  )
    throw new Error("Assegnatario non valido.");
  const reporter = params.get("reporterId");
  if (reporter && !UUID.test(reporter)) throw new Error("Reporter non valido.");
  const overdue = params.get("overdue");
  if (overdue && !["true", "false"].includes(overdue))
    throw new Error("Filtro scadenza non valido.");
  const page = params.get("page") ?? "0",
    size = params.get("size") ?? "20";
  if (
    !/^\d+$/.test(page) ||
    !Number.isSafeInteger(Number(page)) ||
    !/^\d+$/.test(size) ||
    Number(size) < 1 ||
    Number(size) > 100
  )
    throw new Error("Paginazione non valida.");
  const sort = params.get("sort") ?? "createdAt,desc";
  if (
    !/^(createdAt|updatedAt|lastActivityAt|priority|dueDate|title|number),(asc|desc)$/.test(
      sort,
    )
  )
    throw new Error("Ordinamento non valido.");
  return { page: Number(page), size: Number(size), sort };
}
