import argon2 from "argon2";
export { passwordRuleError } from "@/lib/auth/password-rule";

const ARGON: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON);
}

let dummyHash: string | null = null;

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function dummyPasswordHash(): Promise<string> {
  dummyHash ??= await hashPassword("not-a-real-password");
  return dummyHash;
}
