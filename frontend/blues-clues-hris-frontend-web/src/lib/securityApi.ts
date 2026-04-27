import { getUserInfo } from "@/lib/authStorage";
import { loginApi } from "@/lib/authApi";

export async function verifySecondaryAuth(password: string): Promise<void> {
  const trimmed = password.trim();
  if (!trimmed) throw new Error("Password is required.");

  const currentUser = getUserInfo();
  if (!currentUser?.email) {
    throw new Error("Unable to verify identity. Please sign in again.");
  }

  await loginApi({
    identifier: currentUser.email,
    password: trimmed,
    rememberMe: false,
  });
}