type SearchableRow = { id: string; search: string; type?: string; status?: string };

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export function getCollectionWindow<T extends SearchableRow>(rows: T[], options: {
  query: string; type: string; status: string; page: number; selectedId: string | null;
}) {
  const query = normalizeSearch(options.query);
  const filtered = rows.filter(row => normalizeSearch(row.search).includes(query)
    && (!options.type || row.type === options.type)
    && (!options.status || row.status === options.status));
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.max(0, Math.min(options.page, pages - 1));
  const visible = filtered.slice(currentPage * 8, currentPage * 8 + 8);
  const selected = options.selectedId === null ? undefined
    : filtered.find(row => row.id === options.selectedId) ?? visible[0];
  return { filtered, pages, currentPage, visible, selected };
}
