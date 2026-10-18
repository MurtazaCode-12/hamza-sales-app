"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProfile, Profile } from "@/context/ProfileContext";
import { 
  ShieldCheck, 
  Users, 
  ShoppingBag, 
  Plus, 
  Trash2, 
  BookOpen, 
  RotateCw, 
  ExternalLink, 
  LogOut, 
  Home, 
  Briefcase, 
  Sparkles,
  X,
  AlertTriangle,
  ArrowRight,
  FileText
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { UploadPriceListModal } from "@/components/UploadPriceListModal";

export default function AdminPage() {
  const router = useRouter();
  const { profile: activeProfile, isLoading, isAdmin, selectProfile, switchProfile, signOut } = useProfile();
  
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);

  // Add profile modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete profile state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 1. RBAC Guard: If not admin, redirect to user dashboard
  useEffect(() => {
    if (!isLoading) {
      if (!activeProfile) {
        toast.info("Please select a profile first");
        router.push("/select-profile");
      } else if (activeProfile.role !== "admin") {
        toast.error("Unauthorized Access", {
          description: "Admin privileges required. Redirecting to your sales dashboard.",
        });
        router.push("/dashboard");
      }
    }
  }, [isLoading, activeProfile, router]);

  // Fetch all profiles with order counts
  const loadProfiles = useCallback(async (showAnim = false) => {
    try {
      if (showAnim) setIsRefreshing(true);
      setLoadingProfiles(true);
      const res = await fetch("/api/profiles");
      const data = await res.json();
      if (data.success && Array.isArray(data.profiles)) {
        setProfiles(data.profiles);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load profiles");
    } finally {
      setLoadingProfiles(false);
      if (showAnim) setTimeout(() => setIsRefreshing(false), 500);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadProfiles();
    }
  }, [isAdmin, loadProfiles]);

  // Handle Add Profile with Supabase credentials
  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      toast.error("Name, email, and password are all required");
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
          role: newRole 
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Profile "${data.profile.name}" created and verified with Supabase!`);
        setIsAddModalOpen(false);
        setNewName("");
        setNewEmail("");
        setNewPassword("");
        setNewRole("user");
        await loadProfiles();
      } else {
        toast.error(data.error || "Failed to add profile");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to add profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Profile
  const handleDeleteProfile = async (p: Profile) => {
    if (p.id === activeProfile?.id) {
      toast.error("Cannot delete your currently active profile.");
      return;
    }

    if (!confirm(`Are you sure you want to delete profile "${p.name}"? Orders placed by this profile will remain in the database.`)) {
      return;
    }

    try {
      setDeletingId(p.id);
      const res = await fetch(`/api/profiles?id=${p.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Profile "${p.name}" deleted`);
        await loadProfiles();
      } else {
        toast.error(data.error || "Failed to delete profile");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error deleting profile");
    } finally {
      setDeletingId(null);
    }
  };

  // Prevent render before auth check
  if (isLoading || (!activeProfile && isLoading)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <RotateCw className="animate-spin mr-2" size={20} />
        <span>Checking permissions...</span>
      </div>
    );
  }

  if (activeProfile?.role !== "admin") {
    return null; // Will redirect via useEffect
  }

  // Summary Metrics
  const totalProfiles = profiles.length;
  const totalOrders = profiles.reduce((acc, p) => acc + (p._count?.orders ?? 0), 0);
  const adminCount = profiles.filter((p) => p.role === "admin").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      {/* Top Header Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-5 py-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-lg">
              👑
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white leading-tight">Admin Console</h1>
                <span className="bg-rose-500/20 text-rose-300 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-rose-500/30">
                  Full Access
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Logged in as <span className="text-slate-200 font-semibold">{activeProfile.name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadProfiles(true)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
              title="Refresh profiles"
            >
              <RotateCw size={16} className={isRefreshing ? "animate-spin" : ""} />
            </button>
            <button
              onClick={switchProfile}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <Users size={14} />
              <span className="hidden sm:inline">Switch Profile</span>
            </button>
            <Link href="/dashboard">
              <button className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md transition-all">
                <ShoppingBag size={14} />
                <span className="hidden sm:inline">Orders</span>
              </button>
            </Link>
            <Link href="/">
              <button className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all" title="Catalog Home">
                <Home size={16} />
              </button>
            </Link>
            <button
              onClick={signOut}
              className="p-2.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/60 text-rose-300 rounded-xl transition-all"
              title="Sign Out of Supabase"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 pt-8 space-y-8">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Profiles</p>
              <p className="text-3xl font-extrabold text-white">{loadingProfiles ? "—" : totalProfiles}</p>
              <p className="text-[11px] text-slate-500 mt-1">{adminCount} Admins · {totalProfiles - adminCount} Sales Reps</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Users size={24} />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Orders Sent</p>
              <p className="text-3xl font-extrabold text-emerald-400">{loadingProfiles ? "—" : totalOrders}</p>
              <p className="text-[11px] text-slate-500 mt-1">Aggregated across all field agents</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShoppingBag size={24} />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Catalog Pages</p>
              <p className="text-3xl font-extrabold text-amber-400">Brochure</p>
              <p className="text-[11px] text-slate-500 mt-1">Interactive hotspots & AI mapping</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <BookOpen size={24} />
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">System Administration</h2>
            <p className="text-xs text-slate-400">Manage user access rights and interactive catalog hotspots</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsPriceModalOpen(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-600/20 transition-all active:scale-[0.98]"
            >
              <FileText size={16} />
              <span>Upload Price List (PDF)</span>
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98]"
            >
              <Plus size={16} />
              <span>Add New Profile</span>
            </button>

            <Link href="/products">
              <button className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-[0.98]">
                <span>Manage Products &amp; Rates</span>
              </button>
            </Link>

            <Link href="/studio">
              <button className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-[0.98]">
                <BookOpen size={16} className="text-amber-400" />
                <span>Manage Pages (Studio)</span>
              </button>
            </Link>
          </div>
        </div>

        {/* Profiles Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Users size={16} className="text-indigo-400" />
              <span>Registered App Profiles</span>
            </h3>
            <span className="text-xs text-slate-400">{profiles.length} profiles total</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 text-[11px] uppercase font-bold tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Profile</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5 text-center">Orders Sent</th>
                  <th className="px-5 py-3.5">Created Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loadingProfiles ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-500">
                      Loading profiles...
                    </td>
                  </tr>
                ) : profiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-500">
                      No profiles registered yet.
                    </td>
                  </tr>
                ) : (
                  profiles.map((p) => {
                    const isSelf = p.id === activeProfile?.id;
                    const isUserAdmin = p.role === "admin";
                    const orderCount = p._count?.orders ?? 0;
                    const dateStr = p.createdAt
                      ? new Date(p.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—";

                    return (
                      <tr key={p.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold ${
                                isUserAdmin
                                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                  : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                              }`}
                            >
                              {p.avatar || (isUserAdmin ? "👑" : "💼")}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">{p.name}</span>
                                {isSelf && (
                                  <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-700/50 px-1.5 py-0.2 rounded font-semibold">
                                    You
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 font-mono">ID: {p.id.slice(-6)}</span>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                              isUserAdmin
                                ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                                : "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                            }`}
                          >
                            {isUserAdmin ? <ShieldCheck size={12} /> : <Briefcase size={12} />}
                            {p.role}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-center">
                          <span className="inline-block bg-slate-800 text-slate-200 px-3 py-1 rounded-xl font-bold font-mono text-xs">
                            {orderCount}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-xs text-slate-400">
                          {dateStr}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Switch to this profile button */}
                            {!isSelf && (
                              <button
                                onClick={() => {
                                  selectProfile(p);
                                  toast.success(`Switched identity to ${p.name}`);
                                  if (p.role === "admin") {
                                    router.push("/admin");
                                  } else {
                                    router.push("/dashboard");
                                  }
                                }}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                                title={`Simulate or act as ${p.name}`}
                              >
                                Switch <ArrowRight size={12} />
                              </button>
                            )}

                            {/* Delete Profile button */}
                            <button
                              onClick={() => handleDeleteProfile(p)}
                              disabled={isSelf || deletingId === p.id}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                              title={isSelf ? "Cannot delete your active session" : "Delete profile"}
                            >
                              <Trash2 size={15} className={deletingId === p.id ? "animate-pulse" : ""} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ====== ADD PROFILE MODAL ====== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">👤</span>
              <h3 className="text-lg font-bold text-white">Add New Profile</h3>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              Register an administrator or sales representative to the Hamza Sales application.
            </p>

            <form onSubmit={handleAddProfile} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Full Name / Display Name *
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="e.g. Murtaza (Sales Manager)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl p-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. murtaza@hamzatrading.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl p-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
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
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl p-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Permission Level
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
                      <span className="text-xs font-bold">Sales Rep</span>
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
                      <span className="text-xs font-bold">Admin</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug">Full access (*:*), manages team & pages</p>
                  </button>
                </div>
              </div>

              <div className="flex gap-2.5 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Adding..." : "Create Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====== UPLOAD PRICE LIST MODAL ====== */}
      <UploadPriceListModal
        isOpen={isPriceModalOpen}
        onClose={() => setIsPriceModalOpen(false)}
        onSuccess={() => loadProfiles()}
      />
    </div>
  );
}
