import {randomBytes, scryptSync, timingSafeEqual} from "node:crypto";

const keyLength = 32;

function derive(value: string, salt: Buffer): Buffer {
  return scryptSync(value, salt, keyLength);
}

export function createRedactionVerifiers(values: string[]): string[] {
  return values.map(value => {
    const salt = randomBytes(16);
    return `${salt.toString("base64url")}.${derive(value, salt).toString("base64url")}`;
  });
}

export function verifyRedactionVerifiers(
  verifiers: string[],
  values: string[]
): boolean {
  if (values.length < verifiers.length) return false;
  return verifiers.every((verifier, index) => {
    const [encodedSalt, encodedDigest, ...extra] = verifier.split(".");
    if (!encodedSalt || !encodedDigest || extra.length > 0) return false;
    try {
      const expected = Buffer.from(encodedDigest, "base64url");
      const actual = derive(
        values[index] ?? "",
        Buffer.from(encodedSalt, "base64url")
      );
      return (
        expected.length === actual.length && timingSafeEqual(expected, actual)
      );
    } catch {
      return false;
    }
  });
}
