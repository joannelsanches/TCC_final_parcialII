# Autenticação Google

## Configurar o projeto Google

1. No Google Cloud Console, crie ou selecione o projeto. Em **Google Auth Platform**, configure Branding, Audience e Data Access. Informe nome StartIF, contato e domínio público autorizado quando aplicável.
2. Solicite somente `openid`, `email` e `profile`. Se o aplicativo estiver em teste, inclua em Audience os endereços Google que poderão entrar. Se o público for interno, confirme que os usuários pertencem à organização autorizada. Publicação e eventual verificação são realizadas pelo proprietário no Console.
3. Em Clients, crie um cliente OAuth do tipo **Web application**. Cadastre as URLs completas em **Authorized redirect URIs**, respeitando protocolo, porta e caminho:

| Ambiente | URI de retorno |
|---|---|
| Local padrão | `http://localhost:3001/auth/google/callback` |
| Implantação | `https://seu-dominio.example/auth/google/callback` (substitua pelo domínio real) |

O fluxo usa redirecionamento do servidor. Não usa One Tap nem precisa carregar SDK Google no navegador. A URL de uma implantação temporária precisa estar explicitamente autorizada caso seja usada.

No ambiente local, use o mesmo host e porta ao abrir o site e ao configurar o callback. Alternar entre `localhost` e `127.0.0.1` durante a autenticação muda a origem do cookie e pode invalidar a confirmação da sessão.

4. Preencha as variáveis sem incluí-las no Git:

```dotenv
GOOGLE_CLIENT_ID=identificador-do-cliente.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=segredo-fornecido-pelo-console
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
URL_BASE=http://localhost:3001
```

Na implantação, configure o callback HTTPS real e a mesma origem em `URL_BASE`. Reinicie ou reimplante a aplicação após alterar o ambiente. Nenhum segredo deve ser exposto nas views, URLs de acesso ou JavaScript público.

## Fluxos e proteção

“Entrar com Google” inicia Authorization Code com PKCE S256, `state` e `nonce` aleatórios, armazenados na sessão, com validade de dez minutos e uso único. O callback troca o código no servidor. `google-auth-library` verifica a assinatura com os certificados Google; o serviço também exige emissor, audiência, expiração, `email_verified`, `sub` e `nonce` corretos. Não são persistidos tokens Google.

A conta é identificada pelo `sub`, não pelo e-mail. Mudança no e-mail retornado pelo Google não altera automaticamente o e-mail cadastrado do destinatário nem o papel local. Contas inativas são impedidas de entrar, e a sessão é renovada após autenticação.

Os botões **Cadastrar com Google**, na escolha de cadastro e nos formulários, guardam **ESTUDANTE** ou **EMPRESA** na transação da sessão. Após o callback, a identidade verificada preenche nome e e-mail, e o formulário solicita os dados complementares. A conclusão usa o perfil registrado no servidor, recusando alteração por campos enviados pelo navegador e qualquer cadastro público administrativo.

Estudantes precisam de CPF, matrícula, curso de Bagé e e-mail institucional permitido. Esse endereço precisa corresponder à identidade verificada pelo Google; a instituição deve confirmar se o domínio utilizado possui contas Google disponíveis. Dados acadêmicos adicionais e documentos continuam sujeitos às validações do perfil, candidatura e termo. Empresas informam CNPJ, responsável e endereço e continuam dependendo da aprovação administrativa. Uma conta Google não recebe senha inventada nem perfil administrativo.

Usuário e perfil são criados na mesma transação MongoDB. Falhas ou duplicidades desfazem essa transação, preservando os campos complementares para correção. Uma falha posterior ao iniciar a sessão não apaga o cadastro concluído: o usuário pode entrar novamente pelo Google. O cadastro bem-sucedido renova a sessão e direciona ao painel correspondente.

Se a identidade expirar durante o preenchimento, a aplicação solicita nova confirmação. Um rascunho restrito dos campos complementares é preservado na sessão por até uma hora e reapresentado somente para a mesma identidade e o mesmo perfil. Senhas e tokens do provedor não integram esse rascunho.

Se já existe conta local com o e-mail, o callback não a associa sozinho. Entre com e-mail e senha, abra **Conta e acesso**, confirme a senha local e vincule uma identidade Google verificada com o mesmo e-mail. A associação preserva o papel e não aceita um `sub` de outra conta. Uma conta administrativa existente pode ser vinculada por seu titular com essa confirmação.

Cancelamento, configuração ausente, expiração, conta duplicada ou divergência de identidade retornam uma mensagem de erro e preservam o acesso local.

## Validar com o provedor

Depois de configurar o Console, use contas próprias autorizadas para conferir: cadastro completo de estudante e empresa, consentimento, retorno, saída e novo acesso, duplicidade, cancelamento e vinculação com confirmação de senha. Faça isso em localhost e no domínio definitivo. Uma simulação não comprova autorização do cliente OAuth no Console nem acesso real ao provedor.

Referências: [OpenID Connect do Google](https://developers.google.com/identity/openid-connect/openid-connect), [OAuth para aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server), [biblioteca oficial para Node.js](https://github.com/googleapis/google-cloud-node/tree/main/core/packages/google-auth-library-nodejs).
