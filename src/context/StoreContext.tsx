"use client";
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Client } from "@/lib/data"; // Ensure this import exists

type CartItem = {
  productId: string;
  productName: string;
  variantId: string;
  variantDetail: string; 
  qty: number;
};

// --- THIS WAS THE MISSING PART ---
interface StoreState {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (variantId: string) => void;
  clearCart: () => void;
  
  // New Client Fields
  selectedClient: Client | null;
  setClient: (client: Client) => void;
}

const StoreContext = createContext<StoreState | undefined>(undefined);

export const StoreProvider = ({ children }: { children: React.ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Load Cart & Client from Local Storage on startup
  useEffect(() => {
    const savedCart = localStorage.getItem('hamza-cart');
    const savedClient = localStorage.getItem('hamza-client');
    
    if (savedCart) setCart(JSON.parse(savedCart));
    if (savedClient) setSelectedClient(JSON.parse(savedClient));
  }, []);

  // Save Cart whenever it changes
  useEffect(() => {
    localStorage.setItem('hamza-cart', JSON.stringify(cart));
  }, [cart]);

  // Helper to save client
  const setClient = (client: Client) => {
    setSelectedClient(client);
    localStorage.setItem('hamza-client', JSON.stringify(client));
  };

  const addToCart = (newItem: CartItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.variantId === newItem.variantId);
      if (existing) {
        if (newItem.qty <= 0) return prev.filter(i => i.variantId !== newItem.variantId);
        return prev.map((i) => (i.variantId === newItem.variantId ? newItem : i));
      }
      return newItem.qty > 0 ? [...prev, newItem] : prev;
    });
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => i.variantId !== id));
  const clearCart = () => setCart([]);

  return (
    <StoreContext.Provider value={{ 
      cart, 
      addToCart, 
      removeFromCart, 
      clearCart,
      selectedClient, // <--- Passing these down
      setClient       // <--- Passing these down
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