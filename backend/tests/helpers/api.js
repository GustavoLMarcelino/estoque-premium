import jwt from 'jsonwebtoken';

// Os ids precisam bater com os usuários semeados em tests/setup.js —
// requireAuth resolve o usuário no banco a partir do id do token.
const IDS = { admin: 1, user: 2 };

const sign = (role) =>
  jwt.sign({ id: IDS[role], email: `${role}@teste.local`, role }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });

export const authAdmin = () => ({ Authorization: `Bearer ${sign('admin')}` });
export const authUser = () => ({ Authorization: `Bearer ${sign('user')}` });
