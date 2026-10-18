import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { signUp } from "../actions";
import { AuthForm } from "../AuthForm";
import { AuthFrame } from "../AuthFrame";

export const metadata = { title: "Create your account" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <AuthFrame
      title="Try AdMate"
      intro="Create an account to explore a sample ad account (Lotus Skincare), then upload your own export from Meta, TikTok, Google Ads or LinkedIn."
    >
      <AuthForm mode="signup" action={signUp} needsInvite={!!process.env.ADMATE_INVITE_CODE?.trim()} />
    </AuthFrame>
  );
}
