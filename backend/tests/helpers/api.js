import jwt from 'jsonwebtoken';

const sign = (role) =>
  jwt.sign({ id: 1, email: `${role}@teste.local`, role }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });

export const authAdmin = () => ({ Authorization: `Bearer ${sign('admin')}` });
export const authUser = () => ({ Authorization: `Bearer ${sign('user')}` });
