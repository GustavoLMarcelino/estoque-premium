const STORAGE_KEY = 'estoqueTipos';

export const ESTOQUE_TIPOS = {
  BATERIAS: 'baterias',
  SOM: 'som',
};

function hasStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readTipoMap() {
  if (!hasStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Falha ao ler estoqueTipos:', err);
    return {};
  }
}

export function writeTipoMap(map) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map || {}));
  } catch (err) {
    console.error('Falha ao salvar estoqueTipos:', err);
  }
}

export function upsertProdutoTipo(id, tipo) {
  if (!id || !tipo) return;
  const current = readTipoMap();
  const next = { ...current, [id]: tipo };
  writeTipoMap(next);
  return next;
}

