import api from "./api";

// Gerenciamento de usuários (admin-only no backend).
export const UsuariosAPI = {
  listar: async () => {
    const { data } = await api.get("/usuarios");
    return data?.data ?? [];
  },
  criar: async ({ name, email, password, permissoes }) => {
    const { data } = await api.post("/usuarios", { name, email, password, permissoes });
    return data?.data;
  },
  atualizar: async (id, { name, permissoes }) => {
    const { data } = await api.patch(`/usuarios/${id}`, { name, permissoes });
    return data?.data;
  },
  excluir: async (id) => {
    await api.delete(`/usuarios/${id}`);
  },
};
