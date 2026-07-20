export interface MouseWheelEvent {
  direction: -1 | 1;
}

export interface ParsedMouseInput {
  text: string;
  wheel: MouseWheelEvent[];
  pending: string;
}

const escapeChar = "\x1b";
const sgrMouseSequence = /^\[<(\d+);\d+;\d+[Mm]/;
const x11MouseSequence = /^\[M[\s\S]{3}/;
const partialMouseSequence = /^\[?(?:<[\d;]{0,20}|M[\s\S]{0,2})?$/;

function wheelEvent(button: number): MouseWheelEvent | undefined {
  if ((button & 64) === 0 || (button & 2) !== 0) return undefined;
  return {direction: (button & 1) === 0 ? -1 : 1};
}

export function parseMouseInput(data: string): ParsedMouseInput {
  let text = "";
  const wheel: MouseWheelEvent[] = [];
  let index = 0;
  while (index < data.length) {
    const escapeAt = data.indexOf(escapeChar, index);
    if (escapeAt === -1) {
      text += data.slice(index);
      return {text, wheel, pending: ""};
    }
    text += data.slice(index, escapeAt);
    const tail = data.slice(escapeAt + 1);
    const sgr = tail.match(sgrMouseSequence);
    if (sgr) {
      const event = wheelEvent(Number(sgr[1]));
      if (event) wheel.push(event);
      index = escapeAt + 1 + sgr[0].length;
      continue;
    }
    const x11 = tail.match(x11MouseSequence);
    if (x11) {
      const event = wheelEvent(tail.charCodeAt(2) - 32);
      if (event) wheel.push(event);
      index = escapeAt + 1 + x11[0].length;
      continue;
    }
    if (partialMouseSequence.test(tail)) {
      return {text, wheel, pending: data.slice(escapeAt)};
    }
    text += escapeChar;
    index = escapeAt + 1;
  }
  return {text, wheel, pending: ""};
}
