import nodemailer from 'nodemailer';

/**
 * Envia o email de redefinição de senha usando o SMTP configurado no .env
 * (SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD — mesmos nomes dos
 * secrets do CI, mas lidos do ambiente do backend na EC2).
 * Fora de produção, sem SMTP configurado, apenas loga o link no console —
 * permite testar o fluxo em dev e mantém os testes offline.
 */
export async function enviarEmailResetSenha(para, link) {
  const { SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD } = process.env;

  if (!SMTP_SERVER || !SMTP_USERNAME || !SMTP_PASSWORD) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[mailer desativado] Link de redefinição para ${para}: ${link}`);
      return;
    }
    throw new Error('SMTP não configurado (defina SMTP_SERVER, SMTP_USERNAME e SMTP_PASSWORD no .env).');
  }

  const porta = Number(SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: SMTP_SERVER,
    port: porta,
    secure: porta === 465,
    auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD },
  });

  await transporter.sendMail({
    from: `Estoque Premium <${SMTP_USERNAME}>`,
    to: para,
    subject: 'Redefinição de senha — Estoque Premium',
    text:
      'Recebemos um pedido para redefinir a senha da sua conta no Estoque Premium.\n\n' +
      `Abra o link abaixo para escolher uma nova senha (válido por 1 hora):\n${link}\n\n` +
      'Se você não pediu a redefinição, ignore este email — sua senha continua a mesma.',
  });
}
