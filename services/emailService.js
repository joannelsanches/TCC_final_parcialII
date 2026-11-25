import nodemailer from 'nodemailer';

export const escaparHtml = (valor = '') =>
  String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
export function smtpConfigurado() {
  return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);
}
export function urlNotificacao(link) {
  const base = new URL(process.env.URL_BASE || 'http://localhost:3001');
  if (!['http:', 'https:'].includes(base.protocol))
    throw new Error('URL_BASE deve usar HTTP ou HTTPS.');
  const caminho = String(link || '/notificacoes');
  return new URL(
    caminho.startsWith('/') && !caminho.startsWith('//') && !caminho.includes('\\')
      ? caminho
      : '/notificacoes',
    base.origin
  ).href;
}
export function mensagemEmail({ assunto, mensagem, link }) {
  const url = urlNotificacao(link);
  return {
    subject: assunto,
    text: `StartIF • IFSul — Campus Bagé\n\n${assunto}\n\n${mensagem}\n\nAcesse: ${url}\n\nSuas preferências: ${urlNotificacao('/preferencias/notificacoes')}`,
    html: `<div style="font-family:Arial,sans-serif;background:#f4f8ed;padding:28px;color:#293026"><div style="max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden"><div style="background:#487700;padding:24px;color:#fff;font-size:26px;font-weight:bold">StartIF <span style="font-size:13px;font-weight:normal">• Campus Bagé</span></div><div style="padding:28px"><h1 style="font-size:22px">${escaparHtml(assunto)}</h1><p style="line-height:1.7">${escaparHtml(mensagem).replaceAll('\n', '<br>')}</p><p><a style="display:inline-block;background:#487700;color:white;padding:12px 20px;border-radius:10px;text-decoration:none" href="${escaparHtml(url)}">Acompanhar no StartIF</a></p><p style="font-size:13px"><a href="${escaparHtml(urlNotificacao('/preferencias/notificacoes'))}">Gerenciar notificações</a></p></div></div></div>`
  };
}
export function criarTransportador() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true
  });
}
export async function enviarEmail(dados, { transportador } = {}) {
  if (!transportador && !smtpConfigurado())
    return { enviado: false, ignorado: true, naoConfigurado: true, erro: 'SMTP não configurado' };
  try {
    const info = await (transportador || criarTransportador()).sendMail({
      from: process.env.EMAIL_FROM || 'StartIF <noreply@example.test>',
      to: dados.para,
      messageId: dados.messageId,
      ...mensagemEmail(dados)
    });
    if (info.rejected?.length && !info.accepted?.length)
      return { enviado: false, retentavel: false, erro: 'Destinatário recusado pelo SMTP.' };

    return { enviado: true, aceito: true, messageId: info.messageId };
  } catch (erro) {
    const codigo = Number(erro.responseCode || 0);
    const falhaRede = ['ETIMEDOUT', 'ECONNRESET', 'ESOCKET'].includes(erro.code);
    const incerto = falhaRede && (!erro.command || erro.command === 'DATA');
    const temporaria =
      (codigo >= 400 && codigo < 500) ||
      ['ECONNECTION', 'EDNS'].includes(erro.code) ||
      (falhaRede && ['CONN', 'EHLO', 'HELO', 'MAIL FROM', 'RCPT TO'].includes(erro.command));
    return {
      enviado: false,
      incerto,
      retentavel: !incerto && temporaria,
      erro: `Falha SMTP (${erro.code || codigo || 'desconhecida'}).`
    };
  }
}
