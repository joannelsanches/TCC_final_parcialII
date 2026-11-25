# Tema e acessibilidade

## Tema claro e escuro

O botão no cabeçalho está disponível em todas as páginas, com ou sem sessão, inclusive no menu móvel fechado. Use clique, Enter ou Espaço para alternar. `aria-pressed` indica se o tema escuro está ativo; o texto e o ícone identificam o tema atual.

`public/js/tema.js` é carregado no `head`, antes do CSS, e aplica `data-tema` no elemento `html` antes da apresentação da página. A preferência explícita usa a chave `startif-tema` no `localStorage`. Sem escolha explícita, a página acompanha `prefers-color-scheme`, inclusive mudanças do sistema. Alterações de preferência em outra aba também são consideradas.

Quando o armazenamento está indisponível, o botão continua funcionando na página atual; a persistência entre páginas depende da permissão do navegador. A preferência não é gravada na conta nem no MongoDB. As variáveis de cores dos dois temas ficam em `public/css/style.css`; o tema não modifica imagens, e-mails ou PDFs.

## VLibras

O rodapé compartilhado inclui uma única vez o script oficial `https://vlibras.gov.br/app/vlibras-plugin.js`, com carregamento assíncrono. A versão documentada inicializa automaticamente: a aplicação não cria outra instância do widget nem carrega uma cópia local.

O botão e o painel mantêm os controles e a identidade oficiais. `public/js/acessibilidade.js` aguarda a criação do botão e ajusta sua posição para a área inferior, distante da navegação e do controle de tema. A observação tem tempo limitado e não interfere nos formulários se o serviço estiver indisponível. O rodapé reserva espaço ao final da página e mantém uma orientação sobre o recurso.

Para usar, abra o botão oficial do VLibras, aguarde o painel e siga os controles de seleção/tradução do texto. A aparência da ferramenta permanece independente do tema do StartIF. O contorno de foco usa as variáveis CSS documentadas pelo widget.

O carregamento e a tradução dependem da internet e dos serviços externos do VLibras. Firewall, bloqueadores, rede lenta e indisponibilidade desses serviços podem impedir o recurso. A ausência do widget não impede navegação, autenticação ou envio de formulários. A tradução automática pode conter imprecisões e não certifica acessibilidade completa nem substitui intérprete em situações que o exijam.

HTML semântico, labels, link para pular ao conteúdo, foco visível, mensagens de validação e operação por teclado continuam disponíveis independentemente do tradutor. Ao homologar a instalação, confira o botão e a tradução no navegador utilizado, em computador e celular, com os dois temas e com o serviço bloqueado.

Fonte: [integração oficial do VLibras Widget](https://vlibras.gov.br/doc/widget/installation/webpageintegration.html).
