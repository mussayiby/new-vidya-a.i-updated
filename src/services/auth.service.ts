import { supabase } from "@/integrations/supabase/client";
import {
  emptyProfile,
  profileService,
} from "@/services/profile.service";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

export type SignUpResult = {
  account: AuthUser;
  requiresEmailConfirmation: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function displayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const name = user.user_metadata?.["full_name"];

  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }

  return user.email?.split("@")[0] || "Student";
}

function toAuthUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): AuthUser {
  return {
    id: user.id,
    email: user.email ?? "",
    name: displayName(user),
  };
}

/**
 * Converts Supabase authentication errors into
 * user-friendly application errors.
 */
function readableAuthError(
  error: unknown,
  fallback: string,
): Error {
  let message = "";
  let status: number | undefined;

  if (error && typeof error === "object") {
    const errorObject = error as {
      message?: unknown;
      status?: unknown;
    };

    if (typeof errorObject.message === "string") {
      message = errorObject.message.toLowerCase();
    }

    if (typeof errorObject.status === "number") {
      status = errorObject.status;
    }
  }

  if (
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return new Error(
      "Too many attempts. Please wait a moment and try again.",
    );
  }

  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid_credentials")
  ) {
    return new Error("Invalid email or password.");
  }

  if (
    message.includes("email not confirmed") ||
    message.includes("email_not_confirmed")
  ) {
    return new Error(
      "Please confirm your email before signing in.",
    );
  }

  if (
    message.includes("user already registered") ||
    message.includes("already registered")
  ) {
    return new Error(
      "An account with this email already exists. Please log in instead.",
    );
  }

  if (message.includes("signup is disabled")) {
    return new Error(
      "New account registration is currently disabled.",
    );
  }

  if (message.includes("email address") && message.includes("invalid")) {
    return new Error("Enter a valid email address.");
  }

  return new Error(fallback);
}

function logAuthError(operation: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[Auth] ${operation} failed`, error);
  }
}

async function ensureProfile(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const existingProfile =
      await profileService.getForUser(user.id);

    if (existingProfile) {
      return;
    }

    await profileService.save(
      {
        ...emptyProfile,
        name: displayName(user),
        email: user.email ?? "",
      },
      user.id,
    );
  } catch (error) {
    logAuthError("Profile initialization", error);
  }
}

export const authService = {
  async getSession(): Promise<AuthUser | null> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      throw readableAuthError(
        error,
        "Unable to restore your session. Please try again.",
      );
    }

    return session?.user
      ? toAuthUser(session.user)
      : null;
  },

  async signIn(
    email: string,
    password: string,
  ): Promise<AuthUser> {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail.includes("@")) {
      throw new Error("Enter a valid email address.");
    }

    if (password.length < 6) {
      throw new Error(
        "Password must be at least 6 characters.",
      );
    }

    const {
      data,
      error,
    } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data.user) {
      logAuthError("Sign-in", error);
      throw readableAuthError(
        error,
        "Authentication service is temporarily unavailable. Please try again.",
      );
    }

    await ensureProfile(data.user);

    return toAuthUser(data.user);
  },

  async signUp(
    name: string,
    email: string,
    password: string,
  ): Promise<SignUpResult> {
    const trimmedName = name.trim();
    const normalizedEmail = normalizeEmail(email);

    if (!trimmedName) {
      throw new Error("Please enter your name.");
    }

    if (!normalizedEmail.includes("@")) {
      throw new Error("Enter a valid email address.");
    }

    if (password.length < 6) {
      throw new Error(
        "Password must be at least 6 characters.",
      );
    }

    const emailRedirectTo =
      typeof window !== "undefined"
        ? new URL(
            "/auth/callback",
            window.location.origin,
          ).toString()
        : undefined;

    const {
      data,
      error,
    } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: trimmedName,
        },
        ...(emailRedirectTo
          ? { emailRedirectTo }
          : {}),
      },
    });

    if (error || !data.user) {
      logAuthError("Sign-up", error);
      throw readableAuthError(
        error,
        "Unable to create the account. Please try again.",
      );
    }

    /*
     * If email confirmation is enabled in Supabase,
     * data.session will be null until the user confirms
     * their email.
     */
    if (data.session) {
      await ensureProfile(data.user);
    }

    return {
      account: toAuthUser(data.user),
      requiresEmailConfirmation: !data.session,
    };
  },

  async requestPasswordReset(
    email: string,
  ): Promise<void> {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail.includes("@")) {
      throw new Error("Enter a valid email address.");
    }

    const redirectTo =
      typeof window !== "undefined"
        ? new URL(
            "/auth/update-password",
            window.location.origin,
          ).toString()
        : undefined;

    const { error } =
      await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        redirectTo
          ? { redirectTo }
          : undefined,
      );

    if (error) {
      throw readableAuthError(
        error,
        "Unable to send a password-reset email. Please try again.",
      );
    }
  },

  async signOut(): Promise<void> {
    const { error } =
      await supabase.auth.signOut();

    if (error) {
      throw readableAuthError(
        error,
        "Unable to sign out. Please try again.",
      );
    }
  },
};