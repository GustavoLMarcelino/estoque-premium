import { Routes, Route } from 'react-router-dom';
import Home from '../pages/home';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* Adicione outras rotas aqui depois */}
    </Routes>
  );
}
