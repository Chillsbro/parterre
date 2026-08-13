import {expect, test} from "bun:test";
import {
  createCurtainRows,
  getParterreLogoRows
} from "../../../src/app/branding/index.js";

function text(rows: ReturnType<typeof getParterreLogoRows>): string {
  return rows.map(row => row.map(segment => segment.text).join("")).join("\n");
}

test("builds the framed engraved wordmark with one quatrefoil", () => {
  const output = text(getParterreLogoRows());
  expect(output).toContain("╔══╗  ╔══╗  ╔══╗  ╔╦╗");
  expect(output).toContain("B R O W S E R   I N   R E S I D E N C E");
  expect(output).toContain("╔═══════");
  expect(output.split("❖").length - 1).toBe(1);
  expect(output).not.toContain("❦");
  expect(output).not.toContain("✦");
});

test("closed, open, and moving curtains expose the expected stage", () => {
  const closed = text(createCurtainRows(76, 0));
  expect(closed).toContain("▓");
  expect(closed).toContain("▄");
  expect(closed).toContain("┋");
  expect(closed).not.toContain("╔══╗");

  const open = text(createCurtainRows(76, 1));
  expect(open).toContain("╔══╗  ╔══╗  ╔══╗  ╔╦╗");
  expect(open).not.toContain("▓");
  expect(open).not.toContain("▒");
  expect(open).not.toContain("┋");

  const moving = text(createCurtainRows(76, 0.5));
  expect(moving).toContain("▓");
  expect(moving).toContain("▐");
  expect(moving).toContain("▌");
});
