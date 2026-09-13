import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, GraduationCap, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { useApp } from "@/hooks/useApp";

const DEMO_EMAIL = "demo@vidya.ai";
const DEMO_PASSWORD = "anything123";
const DEMO_LOGIN_KEY = "vidya_demo_logged_in";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — Vidya A.I." },
      {
        name: "description",
        content: "Sign in to Vidya A.I. to continue your personalized learning journey.",
      },
      { property: "og:title", content: "Login — Vidya A.I." },
      {
        property: "og:description",
        content: "Sign in to Vidya A.I. to continue your personalized learning journey.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackError = params.get("error");
    if (!callbackError) return;

    setError(callbackError);
    window.history.replaceState({}, document.title, "/login");
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
        // TEMPORARY HACKATHON DEMO LOGIN
        // Only bypasses Supabase authentication on the login page.
        // Do not modify the rest of the application's authentication/data flow.
        window.localStorage.setItem(DEMO_LOGIN_KEY, "true");
        await navigate({ to: "/app/dashboard" });
        return;
      }

      await signIn(email, password);
      await navigate({ to: "/app/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-soft px-4 py-12">
      <Link to="/" className="mb-8 inline-flex items-center gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-gradient-brand text-primary-foreground shadow-float">
          <GraduationCap className="size-5" />
        </span>
        <span className="text-xl font-extrabold tracking-tight">
          Vidya <span className="text-gradient-brand">A.I.</span>
        </span>
      </Link>

      <Card className="w-full max-w-md shadow-float">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to continue learning in your language.</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="text-right">
              <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {loading ? "Logging in..." : "Login"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="font-medium text-primary hover:underline">
                Create account
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
