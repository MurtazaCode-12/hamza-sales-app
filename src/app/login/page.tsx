"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/context/ProfileContext";
import { Lock, Mail, User, ShieldCheck, ArrowRight, ArrowLeft, Sparkles, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectProfile } = useProfile();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [isLoading, setIsLoading] = useState(false);
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);

  // Pre-fill email from query param if available
  useEffect(() => {
    const queryEmail = searchParams.get("email");
    if (queryEmail) {
      setEmail(queryEmail);
    }
  }, [searchParams]);

  const fillQuickAccount = (quickEmail: string, quickPass: string) => {
    setEmail(quickEmail);
    setPassword(quickPass);
    setMode("login");
    setAuthErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthErrorMsg(null);

    if (!email || !password) {
      toast.error("Please enter both email and password");
      return;
    }

    setIsLoading(true);

    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          throw error;
        }

        const user = data.user;
        if (!user) throw new Error("No user returned from Supabase Auth");

        // Sync with PostgreSQL database Profile
        const syncRes = await fetch("/api/profiles/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            name: user.user_metadata?.name || email.split("@")[0],
            role: user.user_metadata?.role || (email.includes("admin") ? "admin" : "user"),
            avatar: user.user_metadata?.avatar,
          }),
        });

        const syncData = await syncRes.json();
        const activeProfile = syncData.profile || {
          id: user.id,
          name: user.user_metadata?.name || email.split("@")[0],
          role: user.user_metadata?.role || "user",
          email: user.email,
          avatar: user.user_metadata?.role === "admin" ? "👑" : "💼",
        };

        selectProfile(activeProfile);
        toast.success(`Welcome back, ${activeProfile.name}!`);

        const redirectUrl = searchParams.get("redirect");
        if (redirectUrl) {
          router.push(redirectUrl);
        } else if (activeProfile.role === "admin") {
          router.push("/admin");
        } else {
          router.push("/dashboard");
        }
      } else {
        // Sign Up with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              name: name.trim() || email.split("@")[0],
              role: role,
              avatar: role === "admin" ? "👑" : "💼",
            },
          },
        });

        if (error) throw error;

        const user = data.user;
        if (!user) throw new Error("Sign up failed");

        // Sync with database profile
        const syncRes = await fetch("/api/profiles/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            name: name.trim() || email.split("@")[0],
            role: role,
            avatar: role === "admin" ? "👑" : "💼",
          }),
        });

        const syncData = await syncRes.json();
        const activeProfile = syncData.profile || {
          id: user.id,
          name: name.trim() || email.split("@")[0],
          role: role,
          email: user.email,
          avatar: role === "admin" ? "👑" : "💼",
        };

        selectProfile(activeProfile);
        toast.success("Account created and verified with Supabase!");

        if (role === "admin") {
          router.push("/admin");
        } else {
          router.push("/dashboard");
        }
      }
    } catch (err: any) {
      console.error("Supabase Auth error:", err);
      const friendlyMessage =
        err.message === "Invalid login credentials"
          ? "Invalid email or password. Please verify your credentials."
          : err.message || "Authentication failed. Please check your details.";
      setAuthErrorMsg(friendlyMessage);
      toast.error(friendlyMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-6">
          <ArrowLeft size={16} /> Back to Catalog
        </Link>
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mx-auto shadow-lg shadow-indigo-600/30">
          <ShieldCheck size={26} />
        </div>
        <h2 className="mt-4 text-center text-2xl font-black tracking-tight text-white">
          Hamza Trading Co.
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          Secure Supabase Authentication
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        {/* Quick Demo Credentials Bar */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 mb-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <KeyRound size={12} className="text-indigo-400" /> Quick Fill Demo Accounts
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillQuickAccount("admin@hamzatrading.com", "HamzaAdmin@2026")}
              className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/40 border border-rose-800/40 rounded-xl text-left transition-colors"
            >
              <div className="text-xs font-bold text-rose-300">👑 Hamza Admin</div>
              <div className="text-[10px] text-slate-400 font-mono">admin@hamzatrading.com</div>
            </button>
            <button
              type="button"
              onClick={() => fillQuickAccount("ali@hamzatrading.com", "HamzaSales@2026")}
              className="px-2.5 py-1.5 bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-800/40 rounded-xl text-left transition-colors"
            >
              <div className="text-xs font-bold text-indigo-300">💼 Ali (Sales Rep)</div>
              <div className="text-[10px] text-slate-400 font-mono">ali@hamzatrading.com</div>
            </button>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 py-8 px-6 shadow-2xl rounded-3xl sm:px-10">
          {/* Tab Switcher */}
          <div className="flex bg-slate-900 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setAuthErrorMsg(null);
              }}
              className={`w-1/2 py-2 text-xs font-bold rounded-lg transition-all ${
                mode === "login" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setAuthErrorMsg(null);
              }}
              className={`w-1/2 py-2 text-xs font-bold rounded-lg transition-all ${
                mode === "signup" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              Sign Up
            </button>
          </div>

          {authErrorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs">
              {authErrorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="text"
                    required
                    placeholder="Ali Sales Rep"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 h-11 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-white placeholder:text-slate-500 focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="email"
                  required
                  placeholder="admin@hamzatrading.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 h-11 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-white placeholder:text-slate-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 h-11 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-white placeholder:text-slate-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {mode === "signup" && (
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Account Role</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("user")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                      role === "user"
                        ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    💼 Sales Rep
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("admin")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                      role === "admin"
                        ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    👑 Admin
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-12 rounded-xl mt-4 shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
            >
              {isLoading ? "Verifying with Supabase..." : mode === "login" ? "Sign In with Supabase" : "Create Account"}
              <ArrowRight size={15} />
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-900 text-center">
            <Link
              href="/select-profile"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              Browse Profiles Directory →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LoginForm />
    </Suspense>
  );
}
