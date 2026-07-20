import {expect, test} from "bun:test";
import {renderToString} from "ink";
import {CurtainReveal, ParterreLogo} from "../../../src/components/index.js";

test("renders the framed engraved wordmark with a single quatrefoil", () => {
  const output = renderToString(<ParterreLogo compact={false} />);
  expect(output).toContain("╔══╗  ╔══╗  ╔══╗  ╔╦╗");
  expect(output).toContain("B R O W S E R   I N   R E S I D E N C E");
  expect(output).toContain("╔═══════");
  expect(output.split("❖").length - 1).toBe(1);
  expect(output).not.toContain("❦");
  expect(output).not.toContain("✦");
});

test("renders a quatrefoil and lowercase name in compact terminals", () => {
  const output = renderToString(<ParterreLogo compact />);
  expect(output).toContain("❖");
  expect(output).toContain("parterre");
});

test("curtain fully closed hides the wordmark behind velvet with gold fringe", () => {
  const output = renderToString(<CurtainReveal width={76} progress={0} />);
  expect(output).toContain("▓");
  expect(output).toContain("▄");
  expect(output).toContain("┋");
  expect(output).not.toContain("╔══╗");
});

test("curtain fully open reveals the wordmark with no velvet or fringe left", () => {
  const output = renderToString(<CurtainReveal width={76} progress={1} />);
  expect(output).toContain("╔══╗  ╔══╗  ╔══╗  ╔╦╗");
  expect(output).not.toContain("▓");
  expect(output).not.toContain("▒");
  expect(output).not.toContain("┋");
});

test("curtain mid-transit shows velvet on both wings and stage in between", () => {
  const output = renderToString(<CurtainReveal width={76} progress={0.5} />);
  expect(output).toContain("▓");
  expect(output).toContain("▐");
  expect(output).toContain("▌");
});
