import type {DOMElement} from "ink";
import type {FrameRegion} from "../../terminal/index.js";

export function measureFrameRegion(
  node: DOMElement | null
): FrameRegion | undefined {
  if (!node?.yogaNode) return undefined;
  let col = 0;
  let row = 0;
  let appHeight = 0;
  let current: DOMElement | undefined = node;
  while (current) {
    const {yogaNode} = current;
    if (yogaNode) {
      col += yogaNode.getComputedLeft();
      row += yogaNode.getComputedTop();
      appHeight = yogaNode.getComputedHeight();
    }
    current = current.parentNode ?? undefined;
  }
  return {
    col,
    row,
    width: node.yogaNode.getComputedWidth(),
    height: node.yogaNode.getComputedHeight(),
    appHeight
  };
}
