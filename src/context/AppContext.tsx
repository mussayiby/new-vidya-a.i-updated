import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { authService, type AuthUser, type SignUpResult } from "@/services/auth.service";
import { emptyProfile, profileService, type StudentProfile } from "@/services/profile.service";
import { dashboardAnalyticsService } from "@/services/dashboard-analytics.service";
import { getLesson } from "@/data/subjects";

type AppContextValue = {
  user: AuthUser | null;
  profile: StudentProfile;
  ready: boolean;
  completedLessons: string[];
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (name: string, email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<StudentProfile>) => Promise<void>;
  toggleLessonComplete: (lessonId: string) => void;
};

export const AppContext = createContext<AppContextValue | null>(null);

const COMPLETED_KEY = "vidya.completedLessons";

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<StudentProfile>(emptyProfile);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let syncVersion = 0;

    const syncAuth = async (sessionUser: AuthUser | null) => {
      const version = ++syncVersion;
      try {
        if (!isMounted || version !== syncVersion) return;

        setUser(sessionUser);

        if (sessionUser) {
          let currentProfile: StudentProfile | null = null;
          try {
            currentProfile = await profileService.getForUser(sessionUser.id);
          } catch (error) {
            if (import.meta.env.DEV) {
              console.error("[Auth] Profile loading failed", error);
            }
          }
          setProfile(
            currentProfile ?? {
              ...emptyProfile,
              name: sessionUser.name,
              email: sessionUser.email,
            },
          );
        } else {
          setProfile(emptyProfile);
        }
      } catch {
        setUser(null);
        setProfile(emptyProfile);
      } finally {
        if (isMounted) setReady(true);
      }
    };

    void authService
      .getSession()
      .then(async (sessionUser) => {
        if (!isMounted) return;
        await syncAuth(sessionUser);
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
          setProfile(emptyProfile);
          setReady(true);
        }
      });

    try {
      const raw = window.localStorage.getItem(COMPLETED_KEY);
      if (raw) setCompletedLessons(JSON.parse(raw));
    } catch {
      // ignore local UI-only lessons for now
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<StudentProfile>) => {
      const nextProfile = { ...profile, ...patch };
      setProfile(nextProfile);

      if (!user?.id) return;

      const savedProfile = await profileService.save(nextProfile, user.id);
      setProfile(savedProfile);
    },
    [profile, user?.id],
  );

  const toggleLessonComplete = useCallback(
    (lessonId: string) => {
      setCompletedLessons((prev) => {
        const isCompleting = !prev.includes(lessonId);
        const next = isCompleting ? [...prev, lessonId] : prev.filter((id) => id !== lessonId);
        window.localStorage.setItem(COMPLETED_KEY, JSON.stringify(next));

        // Record analytics event when completing
        if (isCompleting && user?.id) {
          const lesson = getLesson(lessonId);
          const duration = lesson?.duration ?? 12;
          dashboardAnalyticsService.recordCompletion(user.id, lessonId, duration);
        }

        return next;
      });
    },
    [user?.id],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const account = await authService.signIn(email, password);
    let currentProfile: StudentProfile | null = null;
    try {
      currentProfile = await profileService.getForUser(account.id);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("[Auth] Profile loading failed after sign-in", error);
      }
    }
    setUser(account);
    setProfile(
      currentProfile ?? {
        ...emptyProfile,
        name: account.name,
        email: account.email,
      },
    );
    return account;
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const result = await authService.signUp(name, email, password);
    if (result.requiresEmailConfirmation) return result;

    const account = result.account;
    const nextProfile = {
      ...emptyProfile,
      name: account.name,
      email: account.email,
    };
    setUser(account);
    setProfile(nextProfile);
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setUser(null);
    setProfile(emptyProfile);
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      ready,
      completedLessons,
      signIn,
      signUp,
      signOut,
      updateProfile,
      toggleLessonComplete,
    }),
    [
      user,
      profile,
      ready,
      completedLessons,
      signIn,
      signUp,
      signOut,
      updateProfile,
      toggleLessonComplete,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
