import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { signIn } from "../actions";
import { AuthForm } from "../AuthForm";
import { AuthFrame } from "../AuthFrame";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <AuthFrame title="Sign in" intro="See what needs your attention in your ads, and what to do about it.">
      <AuthForm mode="signin" action={signIn} next={typeof next === "string" ? next : undefined} />
    </AuthFrame>
  );
}
