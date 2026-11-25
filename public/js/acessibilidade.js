(() => {
  function posicionarVLibras() {
    const botao = window.VLibrasWidget?.initBtn;
    if (!botao) return false;

    const acesso = botao.closest('#vlibras-access');
    if (acesso) {
      acesso.style.top = 'auto';
      acesso.style.bottom = 'max(20px, env(safe-area-inset-bottom))';
    }
    return true;
  }

  if (posicionarVLibras()) return;

  const observador = new MutationObserver(() => {
    if (posicionarVLibras()) observador.disconnect();
  });
  observador.observe(document.body, { childList: true });
  window.setTimeout(() => observador.disconnect(), 15000);
})();
