"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getActiveProfile, saveActiveProfile, clearActiveProfile, StoredProfile } from "@/lib/cookie";

export interface Profile {
  id: string;
  name: string;
  role: "admin" | "user" | string;
  avatar?: string | null;
  createdAt?: string | Date;
  _count?: { orders: number };
}

interface ProfileContextType {
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  selectProfile: (profile: Profile) => void;
  clearProfile: () => void;
  switchProfile: () => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  // Read active profile from storage on initial load
  useEffect(() => {
    const saved = getActiveProfile();
    if (saved) {
      setProfileState(saved);
    }
    setIsLoading(false);
  }, []);

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

  const switchProfile = useCallback(() => {
    router.push("/select-profile");
  }, [router]);

  const isAdmin = profile?.role === "admin";

  return (
    <ProfileContext.Provider
      value={{
        profile,
        isLoading,
        isAdmin,
        selectProfile,
        clearProfile,
        switchProfile,
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
