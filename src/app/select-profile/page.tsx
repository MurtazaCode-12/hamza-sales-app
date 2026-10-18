"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile, Profile } from "@/context/ProfileContext";
import { supabase } from "@/lib/supabaseClient";
import { 
  ShieldCheck, 
  User, 
  Plus, 
  ArrowRight, 
  CheckCircle2, 
  Briefcase, 
  Layers, 
  RotateCw,
  ShoppingBag,
  Sparkles,
  Lock,
  LogOut,
  Mail,
  X
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function SelectProfilePage() {
  const router = useRouter();
  const { profile: activeProfile, supabaseUser, selectProfile, signOut } = useProfile();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Auth password modal state
  const [targetAuthProfile, setTargetAuthProfile] = useState<Profile | null>(null);
  const [authPassword, setAuthPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Add Profile Modal State
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch profiles from API
  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/profiles");
      const data = await res.json();
      if (data.success && Array.isArray(data.profiles)) {
        setProfiles(data.profiles);
      }
    } catch (err) {
      console.error("Error fetching profiles:", err);
      toast.error("Failed to load profiles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  // Handle selecting a profile card
  const handleCardClick = (p: Profile) => {
    // If user is already authenticated with Supabase as this profile, proceed immediately
    if (activeProfile?.id === p.id && supabaseUser?.email?.toLowerCase() === p.email?.toLowerCase()) {
      if (p.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
      return;
    }

    // If profile has an email, prompt for password to authenticate via Supabase
    if (p.email) {
      setTargetAuthProfile(p);
      setAuthPassword("");
      setAuthError(null);
    } else {
      // Profile without email -> direct to login to link/authenticate
      router.push(`/login?email=${encodeURIComponent(p.name.toLowerCase().replace(/\s+/g, '') + '@hamzatrading.com')}`);
    }
  };

  // Verify credentials with Supabase Auth
  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAuthProfile?.email || !authPassword) {
      toast.error("Please enter password");
      return;
    }

    setIsVerifying(true);
    setAuthError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: targetAuthProfile.email,
        password: authPassword,
      });

      if (error) {
        throw error;
      }

      selectProfile(targetAuthProfile);
      toast.success(`Authenticated as ${targetAuthProfile.name}!`);
      setTargetAuthProfile(null);

      if (targetAuthProfile.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      console.error("Supabase verification failed:", err);
      const message =
        err.message === "Invalid login credentials"
          ? "Incorrect password. Please verify your credentials."
          : err.message || "Authentication failed";
      setAuthError(message);
      toast.error(message);
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle creating a new authenticated profile
  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      toast.error("Name, email, and password are required");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim().toLowerCase(),
          password: newPassword,
          role: newRole,
        }),
      });

      const data = await res.json();
      if (data.success && data.profile) {
        // Authenticate with the newly created account
        await supabase.auth.signInWithPassword({
          email: newEmail.trim().toLowerCase(),
          password: newPassword,
        });

        selectProfile(data.profile);
        toast.success(`Profile "${data.profile.name}" created and authenticated!`);
        setIsAddingOpen(false);
        setNewName("");
        setNewEmail("");
        setNewPassword("");
        setNewRole("user");

        if (data.profile.role === "admin") {
          router.push("/admin");
        } else {
          router.push("/dashboard");
        }
      } else {
        toast.error(data.error || "Failed to create profile");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans selection:bg-indigo-500 selection:text-white">
      {/* Background ambient gradient glow */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-600 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 left-10 w-[300px] h-[300px] bg-rose-500 rounded-full blur-[120px] opacity-40" />
      </div>

      {/* Main Container */}
      <div className="relative z-10 max-w-2xl w-full mx-auto px-5 pt-10 pb-24">
        {/* Top Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/70 border border-indigo-700/50 text-indigo-300 text-xs font-semibold mb-3">
            <ShieldCheck size={14} className="text-indigo-400" />
            <span>Supabase Authenticated Profiles</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Who is using the app?
          </h1>
          <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
            Select a profile to authenticate with Supabase, load personalized catalog orders, and access role-based features.
          </p>

          {activeProfile && (
            <div className="mt-4 inline-flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2 text-xs">
              <span className="text-slate-400">
                Currently active: <strong className="text-white">{activeProfile.name}</strong> ({activeProfile.role})
              </span>
              <button
                onClick={signOut}
                className="text-red-400 hover:text-red-300 font-bold flex items-center gap-1 hover:underline"
              >
                <LogOut size={12} /> Log Out
              </button>
            </div>
          )}
        </div>

        {/* Profile Card List */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-slate-900/60 border border-slate-800 rounded-2xl h-36 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {profiles.map((p) => {
              const isCurrent = activeProfile?.id === p.id;
              const isAdmin = p.role === "admin";
              const orderCount = p._count?.orders ?? 0;

              return (
                <div
                  key={p.id}
                  onClick={() => handleCardClick(p)}
                  className={`group relative text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                    isCurrent
                      ? "bg-gradient-to-br from-indigo-950/90 to-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-2 ring-indigo-500/30"
                      : "bg-slate-900/80 hover:bg-slate-800/90 border-slate-800 hover:border-slate-700 shadow-lg hover:shadow-xl"
                  }`}
                >
                  <div>
                    {/* Role Badge & Status */}
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider ${
                          isAdmin
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        }`}
                      >
                        {isAdmin ? (
                          <>
                            <ShieldCheck size={13} className="text-rose-400" /> Admin
                          </>
                        ) : (
                          <>
                            <Briefcase size={13} className="text-indigo-400" /> Sales Rep
                          </>
                        )}
                      </span>

                      {isCurrent ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-700/50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={12} /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Lock size={11} /> Password
                        </span>
                      )}
                    </div>

                    {/* Name & Avatar */}
                    <div className="flex items-center gap-3.5 mt-2">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold shadow-md transition-transform group-hover:scale-105 ${
                          isAdmin
                            ? "bg-gradient-to-br from-rose-500 to-amber-600 text-white"
                            : "bg-gradient-to-br from-indigo-600 to-blue-600 text-white"
                        }`}
                      >
                        {p.avatar || (isAdmin ? "👑" : "💼")}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white group-hover:text-indigo-200 transition-colors">
                          {p.name}
                        </h3>
                        {p.email && (
                          <p className="text-[11px] text-slate-400 font-mono truncate max-w-[170px]">
                            {p.email}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <ShoppingBag size={11} />
                          <span>{orderCount} {orderCount === 1 ? "order" : "orders"}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Prompt */}
                  <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
                      {isCurrent ? "Open Dashboard" : "Authenticate & Open"}
                    </span>
                    <span className="text-indigo-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                      {isCurrent ? "Open" : "Sign In"} <ArrowRight size={13} />
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Quick Add Profile Card */}
            <div
              onClick={() => setIsAddingOpen(true)}
              className="p-5 rounded-2xl border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/80 transition-all cursor-pointer flex flex-col items-center justify-center text-center min-h-[140px] group"
            >
              <div className="w-10 h-10 rounded-full bg-slate-800 group-hover:bg-indigo-600/30 flex items-center justify-center text-slate-400 group-hover:text-indigo-300 transition-colors mb-2">
                <Plus size={20} />
              </div>
              <span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">
                Add New Profile
              </span>
              <span className="text-xs text-slate-500 mt-0.5">
                Register a new authenticated account
              </span>
            </div>
          </div>
        )}

        {/* Bottom Shortcuts */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors py-2 px-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700"
          >
            <Layers size={14} className="text-indigo-400" />
            <span>Continue to Product Catalog</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors py-2 px-4 rounded-xl bg-indigo-950/40 border border-indigo-800/60 hover:border-indigo-700"
          >
            <Lock size={14} className="text-indigo-400" />
            <span>Direct Supabase Sign In</span>
          </Link>
        </div>
      </div>

      {/* ====== AUTHENTICATE PASSWORD MODAL ====== */}
      {targetAuthProfile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setTargetAuthProfile(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xl">
                {targetAuthProfile.avatar || (targetAuthProfile.role === "admin" ? "👑" : "💼")}
              </div>
              <div>
                <h3 className="text-base font-bold text-white leading-tight">
                  {targetAuthProfile.name}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {targetAuthProfile.email}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Enter the Supabase account password to switch into this profile:
            </p>

            {authError && (
              <div className="mb-3 p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs">
                {authError}
              </div>
            )}

            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="password"
                  autoFocus
                  required
                  placeholder="Password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full pl-10 pr-4 h-11 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-white placeholder:text-slate-500 focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={isVerifying}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs h-10 rounded-xl"
                >
                  {isVerifying ? "Verifying..." : "Verify & Sign In"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTargetAuthProfile(null)}
                  className="flex-1 border-slate-800 bg-slate-950 text-slate-300 h-10 rounded-xl text-xs"
                >
                  Cancel
                </Button>
              </div>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-800 text-center">
              <Link
                href={`/login?email=${encodeURIComponent(targetAuthProfile.email || "")}`}
                className="text-[11px] text-slate-400 hover:text-indigo-300"
              >
                Forgot password or need help? Open full login →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ====== ADD NEW PROFILE MODAL ====== */}
      {isAddingOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsAddingOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">Create Authenticated Profile</h3>
            <p className="text-xs text-slate-400 mb-5">
              Add a new salesperson or administrator with verified Supabase Auth credentials.
            </p>

            <form onSubmit={handleCreateProfile} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Full Name / Display Name *
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="e.g. Imran (Field Rep)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-sm text-white placeholder-slate-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="imran@hamzatrading.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-sm text-white placeholder-slate-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-sm text-white placeholder-slate-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Role Assignment
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRole("user")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      newRole === "user"
                        ? "bg-indigo-950/80 border-indigo-500 text-white shadow-sm"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Briefcase size={14} className={newRole === "user" ? "text-indigo-400" : "text-slate-500"} />
                      <span className="text-xs font-bold">Sales Rep (User)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug">Personal dashboard, scopes orders to self</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewRole("admin")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      newRole === "admin"
                        ? "bg-rose-950/80 border-rose-500 text-white shadow-sm"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck size={14} className={newRole === "admin" ? "text-rose-400" : "text-slate-500"} />
                      <span className="text-xs font-bold">Administrator</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug">Full access (*:*), manages team & pages</p>
                  </button>
                </div>
              </div>

              <div className="flex gap-2.5 pt-4 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddingOpen(false)}
                  className="flex-1 h-11 border-slate-800 bg-slate-950 text-slate-300 font-bold rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs"
                >
                  {isSubmitting ? "Creating..." : "Create & Authenticate"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
