// Teste apenas da lógica do Login, sem renderizar
describe('Lógica do Login', () => {
  let mockNavigate;

  beforeEach(() => {
    mockNavigate = jest.fn();
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  const validarLogin = (email, senha) => {
    if (!email || !senha) {
      return 'Preencha e-mail e senha.';
    }
    return null;
  };

  const fazerLogin = async (email, senha, navigate) => {
    const erro = validarLogin(email, senha);
    if (erro) {
      alert(erro);
      return false;
    }

    // Simula delay de login
    return new Promise((resolve) => {
      setTimeout(() => {
        const usuario = { email, logado: true };
        localStorage.setItem('usuarioLogado', JSON.stringify(usuario));
        navigate('/home');
        resolve(true);
      }, 100);
    });
  };

  test('validação de campos obrigatórios', () => {
    const resultado = validarLogin('', '');
    expect(resultado).toBe('Preencha e-mail e senha.');
  });

  test('login bem-sucedido salva no localStorage e navega', async () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});

    const loginPromise = fazerLogin('teste@exemplo.com', '123456', mockNavigate);
    
    // Avança os timers
    jest.advanceTimersByTime(100);
    
    const resultado = await loginPromise;

    expect(resultado).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith('/home');
    
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    expect(usuario.email).toBe('teste@exemplo.com');
    
    alertMock.mockRestore();
  });

  test('exibe alerta quando campos estão vazios', () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});

    fazerLogin('', '', mockNavigate);

    expect(alertMock).toHaveBeenCalledWith('Preencha e-mail e senha.');
    expect(mockNavigate).not.toHaveBeenCalled();
    
    alertMock.mockRestore();
  });
});