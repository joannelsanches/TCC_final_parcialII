(() => {
  const chave = 'startif-tema';
  const raiz = document.documentElement;
  const preferenciaSistema = window.matchMedia?.('(prefers-color-scheme: dark)');
  const temaValido = (valor) => valor === 'claro' || valor === 'escuro';
  const temaDoSistema = () => (preferenciaSistema?.matches ? 'escuro' : 'claro');
  let escolha = null;

  try {
    const salva = window.localStorage.getItem(chave);
    if (temaValido(salva)) escolha = salva;
  } catch {}

  function aplicar(tema) {
    raiz.dataset.tema = tema;
    raiz.style.colorScheme = tema === 'escuro' ? 'dark' : 'light';

    for (const botao of document.querySelectorAll('[data-tema-toggle]')) {
      const escuro = tema === 'escuro';
      botao.setAttribute('aria-pressed', String(escuro));
      botao.title = escuro ? 'Ativar tema claro' : 'Ativar tema escuro';
      const rotulo = botao.querySelector('[data-tema-rotulo]');
      if (rotulo) rotulo.textContent = escuro ? 'Tema escuro' : 'Tema claro';
    }
  }

  aplicar(escolha || temaDoSistema());

  function prepararControle() {
    aplicar(escolha || temaDoSistema());
    for (const botao of document.querySelectorAll('[data-tema-toggle]')) {
      botao.addEventListener('click', () => {
        escolha = raiz.dataset.tema === 'escuro' ? 'claro' : 'escuro';
        aplicar(escolha);
        try {
          window.localStorage.setItem(chave, escolha);
        } catch {}
      });
    }
  }

  preferenciaSistema?.addEventListener('change', () => {
    if (!escolha) aplicar(temaDoSistema());
  });

  window.addEventListener('storage', (evento) => {
    if (evento.key !== chave && evento.key !== null) return;
    escolha = temaValido(evento.newValue) ? evento.newValue : null;
    aplicar(escolha || temaDoSistema());
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prepararControle, { once: true });
  } else {
    prepararControle();
  }
})();
