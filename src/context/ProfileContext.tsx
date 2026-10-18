"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getActiveProfile, saveActiveProfile, clearActiveProfile } from "@/lib/cookie";
import { supabase } from "@/lib/supabaseClient";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  name: string;
  email?: string | null;
  role: "admin" | "user" | string;
  avatar?: string | null;
  createdAt?: string | Date;
  _count?: { orders: number };
}

interface ProfileContextType {
  profile: Profile | null;
  supabaseUser: SupabaseUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  selectProfile: (profile: Profile) => void;
  clearProfile: () => void;
  switchProfile: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  // Helper to sync Supabase user with PostgreSQL profile
  const syncProfileWithUser = useCallback(async (user: SupabaseUser): Promise<Profile | null> => {
    try {
      const email = user.email;
      if (!email) return null;

      const res = await fetch('/api/profiles/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: user.user_metadata?.name || email.split('@')[0],
          role: user.user_metadata?.role || (email.includes('admin') ? 'admin' : 'user'),
          avatar: user.user_metadata?.avatar,
        }),
      });

      const data = await res.json();
      if (data.success && data.profile) {
        setProfileState(data.profile);
        saveActiveProfile({
          id: data.profile.id,
          name: data.profile.name,
          role: data.profile.role,
          avatar: data.profile.avatar,
        });
        return data.profile;
      }
    } catch (err) {
      console.warn('Profile sync failed:', err);
    }
    return null;
  }, []);

  // Listen to Supabase Auth state changes
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mounted) {
          setSupabaseUser(session.user);
          await syncProfileWithUser(session.user);
        } else if (mounted) {
          // Check if cached profile exists
          const saved = getActiveProfile();
          if (saved) {
            setProfileState(saved);
          }
        }
      } catch (err) {
        console.warn('Auth initialization check failed:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (session?.user) {
          setSupabaseUser(session.user);
          await syncProfileWithUser(session.user);
        } else if (event === 'SIGNED_OUT') {
          setSupabaseUser(null);
          setProfileState(null);
          clearActiveProfile();
        }
      }
    );

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [syncProfileWithUser]);

  const selectProfile = useCallback((newProfile: Profile) => {
    setProfileState(newProfile);
    saveActiveProfile({
      id: newProfile.id,
      name: newProfile.name,
      role: newProfile.role,
      avatar: newProfile.avatar,
    });
  }, []);

  const clearProfile = useCallback(() => {
    setProfileState(null);
    clearActiveProfile();
  }, []);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Supabase sign out error:', err);
    } finally {
      clearProfile();
      setSupabaseUser(null);
      setIsLoading(false);
      router.push('/login');
    }
  }, [clearProfile, router]);

  const switchProfile = useCallback(() => {
    router.push('/select-profile');
  }, [router]);

  const refreshProfile = useCallback(async () => {
    if (supabaseUser) {
      await syncProfileWithUser(supabaseUser);
    }
  }, [supabaseUser, syncProfileWithUser]);

  const isAdmin = profile?.role === 'admin';
  const isAuthenticated = !!profile;

  return (
    <ProfileContext.Provider
      value={{
        profile,
        supabaseUser,
        isLoading,
        isAdmin,
        isAuthenticated,
        selectProfile,
        clearProfile,
        switchProfile,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return context;
}
