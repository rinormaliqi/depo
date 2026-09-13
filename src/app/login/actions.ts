"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

type FormState = { error?: string } | undefined;

export async function login(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/builder" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    throw error;
  }
}
