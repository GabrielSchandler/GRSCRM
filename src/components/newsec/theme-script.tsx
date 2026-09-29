/**
 * Le o tema salvo (localStorage) e aplica no wrapper #ns-shell-root antes da
 * primeira pintura, evitando flash de tema. Precisa ser o primeiro filho
 * dentro do wrapper (o script roda assim que o parser chega nele, e nesse
 * ponto a tag de abertura do wrapper ja existe no DOM).
 */
export function ThemeScript() {
  const script = `
    (function () {
      try {
        var root = document.currentScript && document.currentScript.parentElement;
        if (!root) return;
        var stored = localStorage.getItem("newsec-theme");
        var resolved =
          stored === "light" || stored === "dark"
            ? stored
            : window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light";
        root.setAttribute("data-theme", resolved);
      } catch (e) {}
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
