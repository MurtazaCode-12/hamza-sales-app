"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile, Profile } from "@/context/ProfileContext";
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
  X
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function SelectProfilePage() {
  const router = useRouter();
  const { profile: activeProfile, selectProfile } = useProfile();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch profiles from API (auto-seeds defaults if none)
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
  const handleSelect = (p: Profile) => {
    selectProfile(p);
    toast.success(`Active profile set to ${p.name}`, {
      description: p.role === "admin" ? "Redirecting to Admin Dashboard..." : "Redirecting to Sales Dashboard...",
    });

    // Permission routing based on RBAC state machine
    if (p.role === "admin") {
      router.push("/admin");
    } else {
      router.push("/dashboard");
    }
  };

  // Handle creating a new profile
  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("Please enter a name");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          role: newRole,
        }),
      });
      const data = await res.json();
      if (data.success && data.profile) {
        toast.success(`Profile "${data.profile.name}" created!`);
        setIsAddingOpen(false);
        setNewName("");
        setNewRole("user");
        await fetchProfiles();
        // Immediately select the newly created profile
        handleSelect(data.profile);
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
      <div className="relative z-10 max-w-2xl w-full mx-auto px-5 pt-12 pb-24">
        {/* Top Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/70 border border-indigo-700/50 text-indigo-300 text-xs font-semibold mb-3">
            <Sparkles size={13} className="text-indigo-400" />
            <span>Frictionless Identity Switcher</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Who is using the app?
          </h1>
          <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
            Select your profile to load personalized catalog orders, track sales activity, and access role-based tools.
          </p>
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
                  onClick={() => handleSelect(p)}
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

                      {isCurrent && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-700/50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={12} /> Active
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
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <ShoppingBag size={12} className="text-slate-500" />
                          <span>{orderCount} {orderCount === 1 ? "order" : "orders"} submitted</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Prompt */}
                  <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
                      {isAdmin ? "Open Admin & All Orders" : "Open My Dashboard"}
                    </span>
                    <span className="text-indigo-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                      Select <ArrowRight size={13} />
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
                Register a new sales rep or admin
              </span>
            </div>
          </div>
        )}

        {/* Bottom Catalog Shortcut */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors py-2 px-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700"
          >
            <Layers size={14} className="text-indigo-400" />
            <span>Continue to Product Catalog</span>
          </Link>
        </div>
      </div>

      {/* ====== ADD PROFILE MODAL ====== */}
      {isAddingOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsAddingOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">Create New Profile</h3>
            <p className="text-xs text-slate-400 mb-5">
              Add a new salesperson or administrator to the app. No passwords or authentication required.
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
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl p-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
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
                <button
                  type="button"
                  onClick={() => setIsAddingOpen(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Save & Select"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
