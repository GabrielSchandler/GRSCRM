/**
 * Som de aviso de mensagem nova, gerado na hora pelo navegador (sem arquivo de áudio).
 *
 * Timbre de "sino/marimba": cada nota é a fundamental + um harmônico fraco, com ataque rápido e
 * queda suave (~0,6 s) — soa como notificação de aplicativo, não como bip. Passa por um
 * compressor pra poder ficar mais alto sem distorcer. (O primeiro som era um bip seco e baixo;
 * o Gabriel pediu um mais agradável, 01/10/2026.)
 *
 * O navegador só libera áudio depois de um clique/tecla na página: `prepararAudio()` é chamado no
 * primeiro gesto e deixa o contexto pronto pros avisos seguintes.
 */

let contexto: AudioContext | null = null;
let saida: AudioNode | null = null;

export function prepararAudio() {
  try {
    if (!contexto) {
      contexto = new AudioContext();
      const compressor = contexto.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 4;
      const volumeGeral = contexto.createGain();
      volumeGeral.gain.value = 0.9;
      compressor.connect(volumeGeral).connect(contexto.destination);
      saida = compressor;
    }
    if (contexto.state !== "running") void contexto.resume();
  } catch {
    // navegador sem áudio: segue só com aviso visual
  }
}

function nota(frequencia: number, inicio: number, duracao: number, volume: number) {
  if (!contexto || !saida) return;
  const parciais: Array<[number, number, OscillatorType]> = [
    [1, 1, "sine"], // fundamental
    [2, 0.28, "sine"], // oitava — dá o brilho de sino
    [3.01, 0.08, "triangle"], // leve "metal"
  ];
  for (const [multiplo, peso, forma] of parciais) {
    const osc = contexto.createOscillator();
    const ganho = contexto.createGain();
    osc.type = forma;
    osc.frequency.value = frequencia * multiplo;
    const pico = volume * peso;
    ganho.gain.setValueAtTime(0.0001, inicio);
    ganho.gain.exponentialRampToValueAtTime(pico, inicio + 0.012);
    // harmônicos caem mais rápido que a fundamental, como num sino de verdade
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao / multiplo ** 0.5);
    osc.connect(ganho).connect(saida);
    osc.start(inicio);
    osc.stop(inicio + duracao + 0.05);
  }
}

/** WhatsApp: duas notas subindo (sol → dó). Chat interno: arpejo curto e mais agudo (dó → mi → sol). */
export function tocarSomAviso(tipo: "whatsapp" | "interno") {
  prepararAudio();
  if (!contexto) return;
  const agora = contexto.currentTime + 0.02;
  if (tipo === "interno") {
    nota(1046.5, agora, 0.55, 0.55);
    nota(1318.5, agora + 0.11, 0.55, 0.5);
    nota(1568, agora + 0.22, 0.8, 0.55);
  } else {
    nota(784, agora, 0.6, 0.6);
    nota(1046.5, agora + 0.16, 0.9, 0.6);
  }
  // Marca de quando tocou (conferência/teste; não aparece na tela).
  document.documentElement.dataset.nsUltimoSom = String(Date.now());
}
