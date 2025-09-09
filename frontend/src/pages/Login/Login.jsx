// src/pages/Login/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

export default function Login() {
  const [email, setEmail]     = useState('');
  const [senha, setSenha]     = useState('');
  const [erro, setErro]       = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
  e.preventDefault();
  setErro('');
  setLoading(true);

  setTimeout(() => {
    // ✅ Aceita qualquer combinação de e-mail/senha
    localStorage.setItem('usuarioLogado', JSON.stringify({ email }));
    navigate('/home'); // redireciona para Home
    setLoading(false);
    }, 800);
  };


  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <h2>Entrar</h2>

        {erro && <div className="login-error">{erro}</div>}

        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@exemplo.com"
          required
        />

        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="••••••••"
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
