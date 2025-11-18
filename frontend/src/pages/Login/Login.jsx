// src/pages/Login/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TitleComponent from '../../components/TitleComponent';
import LabelComponent from '../../components/LabelComponent';
import InputComponent from '../../components/InputComponent';
import FormGroupComponent from '../../components/FormGroupComponent';

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
    <div className="flex items-center justify-center min-h-screen bg-[#f4f4f4] p-[20px]">
      <div className="login-form bg-white p-[30px_40px] rounded-[8px] shadow-[0px_4px_12px_rgba(0,0,0,0.1)] w-full max-w-[360px] text-center">
        <TitleComponent text={"Entrar"}/>
        <form className='flex flex-col text-start font-medium gap-[16px]' onSubmit={handleSubmit}>
          {erro && <div className="mb-[16px] !p-[10px] bg-[#ffe5e5] !text-[#d8000c] border !border-[#d8000c] !rounded-[4px] !text-[14px]">{erro}</div>}

          <FormGroupComponent>
            <LabelComponent htmlFor={"email"} text={"E-mail"}/>
            <InputComponent idName="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@exemplo.com"/>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"senha"} text={"Senha"}/>
            <InputComponent idName="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••"/>
          </FormGroupComponent>

          <button className='w-full bg-[#646cff] text-white p-[12px_24px] max-xl:p-[8px_12px] !text-base max-xl:!text-xs border-none !rounded-[6px] cursor-pointer transition-[background-color_0.3s_ease] !mt-[20px] focus:outline-0 hover:not-disabled:bg-[#535bf2] disabled:bg-[#a0a0a0] disabled:cursor-default' type={"submit"} disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  );
}
