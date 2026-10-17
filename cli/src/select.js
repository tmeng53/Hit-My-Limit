// A small arrow-key menu: ↑/↓ or k/j to move, a number to jump, Enter to choose, Ctrl+C or q to quit.
import { emitKeypressEvents } from 'node:readline';
import { colors } from './display.js';

export function select(question, choices, start = 0, { input = process.stdin, output = process.stdout, c = colors(true) } = {}) {
  return new Promise((resolve, reject) => {
    let at = Math.min(Math.max(0, start), choices.length - 1);
    let drawn = 0;
    const draw = () => {
      if (drawn) output.write(`\x1b[${drawn}A\x1b[0J`);
      const lines = [c.bold(question), ...choices.map(([, label], i) => (i === at ? `  ${c.green(`› ${label}`)}` : c.dim(`    ${label}`)))];
      lines.push(c.dim('  ↑/↓ or j/k to move, Enter to choose'));
      output.write(`${lines.join('\n')}\n`);
      drawn = lines.length;
    };
    const done = (err, value) => {
      input.off('keypress', onKey);
      input.setRawMode?.(false);
      input.pause();
      // Leave one line behind: the question and the answer.
      output.write(`\x1b[${drawn}A\x1b[0J`);
      if (!err) output.write(`${c.bold(question)} ${choices[at][1]}\n`);
      if (err) reject(err);
      else resolve(value);
    };
    const onKey = (str, key = {}) => {
      if ((key.ctrl && key.name === 'c') || key.name === 'q' || key.name === 'escape') return done(new Error('Nothing was sent.'));
      if (key.name === 'up' || key.name === 'k') at = (at + choices.length - 1) % choices.length;
      else if (key.name === 'down' || key.name === 'j' || key.name === 'tab') at = (at + 1) % choices.length;
      else if (key.name === 'return' || key.name === 'enter') return done(null, choices[at][0]);
      else if (/^[1-9]$/.test(str ?? '') && Number(str) <= choices.length) at = Number(str) - 1;
      else return;
      draw();
    };
    emitKeypressEvents(input);
    input.setRawMode?.(true);
    input.resume();
    input.on('keypress', onKey);
    draw();
  });
}
