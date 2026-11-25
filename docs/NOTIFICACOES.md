# Notificações internas e e-mail

## Configuração SMTP

```dotenv
SMTP_HOST=smtp.seu-provedor.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario-autorizado
SMTP_PASS=senha-ou-credencial-do-provedor
EMAIL_FROM=StartIF <remetente-verificado@seu-dominio.example>
URL_BASE=https://startif.seu-dominio.example
```

Substitua os exemplos pelos dados autorizados do provedor. A porta 587 normalmente usa STARTTLS com `SMTP_SECURE=false`; na 465 use `SMTP_SECURE=true` para TLS desde a conexão. A verificação de certificados TLS permanece habilitada. `SMTP_USER` e `SMTP_PASS` são usados quando há autenticação; um relay sem autenticação só deve ser usado se for autorizado pelo responsável pelo servidor.

O remetente precisa ser aceito pelo provedor. Configure os registros de domínio solicitados por ele (SPF/DKIM e política DMARC, quando aplicáveis). Não use nomes antigos `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER` e `EMAIL_PASS`: o serviço utiliza `SMTP_*` e `EMAIL_FROM`. `URL_BASE` determina os links da mensagem e deve ser a origem pública correta.

Sem `SMTP_HOST` ou `EMAIL_FROM`, o canal fica `NAO_CONFIGURADO`, sem derrubar outros módulos. O destinatário é sempre o e-mail atual de `Usuario`, sujeito à conta ativa e à preferência de recebimento. O e-mail de contato da empresa ou o retorno do provedor de identidade não substituem esse endereço silenciosamente.

## Eventos e fila

A notificação interna é persistida independentemente do envio externo. Novas vagas compatíveis, mudanças de candidatura, documentos pendentes, decisões sobre termos e convênios e lembretes utilizam os serviços compartilhados. Mensagens têm texto e HTML em português, identidade StartIF e link para o processo. A interface permite desativar o e-mail, mantendo as notificações internas.

`Notificacao.email` registra solicitação, estado, tentativas, resultado, identificador de mensagem, datas de tentativa/envio e próximo processamento. A criação usa chave única para os eventos que podem se repetir. A fila reivindica cada item de forma atômica e verifica destinatário e condições do evento antes de enviar. Uma vaga retirada de uso não continua gerando oferta por e-mail.

São permitidas até três tentativas. Falhas temporárias elegíveis aguardam aproximadamente cinco e depois vinte e cinco minutos. Recusas permanentes não são repetidas. Timeout ou perda da conexão na etapa de dados pode significar aceitação pelo provedor: o estado fica `INCERTO`, sem repetir automaticamente e arriscar outra mensagem. Bloqueio abandonado também fica incerto. O administrador deve conferir o resultado no provedor antes de qualquer reenvio manual.

```bash
npm run notificacoes:processar
npm run notificacoes:processar -- --retomar-nao-configurados
npm run atualizar-prazos
```

O primeiro comando processa um lote limitado. O segundo recoloca somente os itens antes não configurados para tentativa, depois que o SMTP for habilitado; não reabre envios incertos ou permanentes. A rotina de prazos cria lembretes persistentes. Use um agendador para executar os comandos regularmente. A implantação também oferece endpoints protegidos por segredo, descritos em [OPERAÇÃO](OPERACAO.md).

## Histórico de canais descontinuados

A integração de mensageria antiga foi retirada. Para bases existentes, simule e aplique `npm run migrar:canais:simular` e `npm run migrar:canais`, com backup. A migração preserva os campos legados em `historicoCanaisRemovidos` antes de removê-los dos registros ativos, sem apagar usuários ou notificações. A coleção de histórico é privada e não é processada pela fila.


## Validação

Os testes usam Nodemailer com transporte JSON/simulado, verificando HTML/texto, destinatário, falha temporária/permanente, duplicidade, concorrência e persistência interna. Eles não enviam mensagens reais. Para homologar o SMTP, dispare uma notificação para uma conta de teste consentida, execute a fila e confira a entrega na caixa postal e no painel do provedor. `ENVIADO` representa aceitação SMTP; não garante leitura nem entrega final na caixa de entrada.

Referências: [SMTP Nodemailer](https://nodemailer.com/smtp) e [transporte simulado](https://nodemailer.com/transports/stream).
