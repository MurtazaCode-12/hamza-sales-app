"use client";
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Client } from "@/lib/data";

export type UnitType = "Packet" | "Pcs" | "Box" | "Dozen" | "Set";
export const ALLOWED_UNITS: UnitType[] = ["Packet", "Pcs", "Box", "Dozen", "Set"];

export type CartItem = {
  productId: string;
  productName: string;
  variantId: string;
  variantDetail: string; 
  qty: number;
  rate?: number;
  unit?: UnitType | string;
  totalPrice?: number;
};

interface StoreState {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (variantId: string) => void;
  updateCartQty: (variantId: string, qty: number) => void;
  updateCartRate: (variantId: string, rate: number) => void;
  updateCartUnit: (variantId: string, unit: string) => void;
  addCustomItem: (item: { productName: string; rate: number; qty: number; unit?: string; variantDetail?: string }) => void;
  clearCart: () => void;
  
  // Rate Visibility Toggle
  showRates: boolean;
  toggleShowRates: () => void;

  // Client Fields
  selectedClient: Client | null;
  setClient: (client: Client) => void;
}

const StoreContext = createContext<StoreState | undefined>(undefined);

export const StoreProvider = ({ children }: { children: React.ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showRates, setShowRates] = useState<boolean>(true);

  // Load Cart, Client & Rate visibility from Local Storage on startup
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem('hamza-cart');
      const savedClient = localStorage.getItem('hamza-client');
      const savedShowRates = localStorage.getItem('hamza-show-rates');
      
      if (savedCart) setCart(JSON.parse(savedCart));
      if (savedClient) setSelectedClient(JSON.parse(savedClient));
      if (savedShowRates !== null) setShowRates(savedShowRates === 'true');
    } catch (e) {
      console.warn('Failed to load store state from localStorage:', e);
    }
  }, []);

  // Save Cart whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('hamza-cart', JSON.stringify(cart));
    } catch {}
  }, [cart]);

  // Helper to toggle show rates
  const toggleShowRates = () => {
    setShowRates(prev => {
      const next = !prev;
      try {
        localStorage.setItem('hamza-show-rates', String(next));
      } catch {}
      return next;
    });
  };

  // Helper to save client
  const setClient = (client: Client) => {
    setSelectedClient(client);
    try {
      localStorage.setItem('hamza-client', JSON.stringify(client));
    } catch {}
  };

  const addToCart = (newItem: CartItem) => {
    setCart((prev) => {
      const defaultUnit = newItem.unit || "Pcs";
      const defaultRate = Number(newItem.rate || 0);
      const calculatedTotal = newItem.totalPrice !== undefined ? newItem.totalPrice : defaultRate * newItem.qty;

      const itemWithDefaults: CartItem = {
        ...newItem,
        unit: defaultUnit,
        rate: defaultRate,
        totalPrice: calculatedTotal,
      };

      const existingIndex = prev.findIndex((i) => i.variantId === newItem.variantId);
      if (existingIndex > -1) {
        if (newItem.qty <= 0) return prev.filter((_, idx) => idx !== existingIndex);
        const updated = [...prev];
        const existing = updated[existingIndex];
        const newQty = newItem.qty;
        const rate = newItem.rate !== undefined ? newItem.rate : existing.rate || 0;
        updated[existingIndex] = {
          ...existing,
          ...newItem,
          qty: newQty,
          rate: rate,
          totalPrice: rate * newQty,
        };
        return updated;
      }
      return newItem.qty > 0 ? [...prev, itemWithDefaults] : prev;
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.variantId !== id));
  };

  const updateCartQty = (id: string, qty: number) => {
    setCart(prev => prev.map(i => {
      if (i.variantId === id) {
        const rate = Number(i.rate || 0);
        return { ...i, qty, totalPrice: rate * qty };
      }
      return i;
    }));
  };

  const updateCartRate = (id: string, rate: number) => {
    setCart(prev => prev.map(i => {
      if (i.variantId === id) {
        return { ...i, rate, totalPrice: rate * i.qty };
      }
      return i;
    }));
  };

  const updateCartUnit = (id: string, unit: string) => {
    setCart(prev => prev.map(i => i.variantId === id ? { ...i, unit } : i));
  };

  const addCustomItem = (item: { productName: string; rate: number; qty: number; unit?: string; variantDetail?: string }) => {
    const customId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const unit = item.unit || "Pcs";
    const rate = Number(item.rate || 0);
    const qty = Number(item.qty || 1);

    addToCart({
      productId: customId,
      productName: item.productName,
      variantId: customId,
      variantDetail: item.variantDetail || "Custom Entry",
      qty: qty,
      rate: rate,
      unit: unit,
      totalPrice: rate * qty,
    });
  };

  const clearCart = () => setCart([]);

  return (
    <StoreContext.Provider value={{ 
      cart, 
      addToCart, 
      removeFromCart, 
      updateCartQty,
      updateCartRate,
      updateCartUnit,
      addCustomItem,
      clearCart,
      showRates,
      toggleShowRates,
      selectedClient,
      setClient
    }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreProvider");
  return context;
};