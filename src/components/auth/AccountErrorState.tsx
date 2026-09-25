import { useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { AuthLayout } from "./AuthLayout";
import { ProfileLoadError, ProfileMissingError } from "@/lib/auth/profile";
import { useLogout } from "@/lib/auth/session";

function copyFor(error: unknown): { title: string; message: string } {
  if (error instanceof ProfileMissingError) {
    return {
      title: "We couldn't finish setting up your account",
      message:
        "Your sign-in worked, but your AdMate profile isn't ready yet. Please try again in a moment.",
    };
  }
  if (error instanceof ProfileLoadError) {
    return {
      title: "We couldn't load your account",
      message: "Something went wrong while loading your account. Please try again.",
    };
  }
  return { title: "This page didn't load", message: "Something went wrong. Please try again." };
}

/**
 * Shown when a signed-in page can't load (e.g. the profile is missing or
 * unreadable). Never falls back to creating data from the client.
 */
export function AccountErrorState({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  const logout = useLogout();
  const { title, message } = copyFor(error);

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
      <div className="mt-6 flex flex-col gap-2">
        <Button
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          Try again
        </Button>
        <Button variant="outline" onClick={() => void logout()}>
          Log out
        </Button>
      </div>
    </AuthLayout>
  );
}
