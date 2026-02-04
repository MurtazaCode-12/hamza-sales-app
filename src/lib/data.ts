export type Variant = {
  id: string;
  size: string;
  finish?: string;    
  packSize?: string;  
  weight?: string;    
};

export type Product = {
  id: string;
  name: string;
  category: "Hinges" | "Locks" | "Screws" | "Door Kits";
  image: string;
  variants: Variant[];
};

// FIX: Added .png to all image URLs to prevent SVG crashes
export const CATALOG: Product[] = [
  // --- HINGES ---
  {
    id: "hinge-ss-welded",
    name: "S.S. Butt Hinge (Welded)",
    category: "Hinges",
    image: "https://placehold.co/100x100.png?text=Hinge", 
    variants: [
      { id: "hw-33858", size: "3 x 3/8 x 5/8", packSize: "40 Pcs", weight: "1.480kg" },
      { id: "hw-31234", size: "3 x 1/2 x 3/4", packSize: "30 Pcs", weight: "1.260kg" },
      { id: "hw-41234", size: "4 x 1/2 x 3/4", packSize: "20 Pcs", weight: "1.160kg" },
      { id: "hw-512", size: "5 x 12 Gauge", packSize: "10 Pcs", weight: "1.900kg" },
      { id: "hw-412-ant", size: "4 x 12 Antique", finish: "Antique", packSize: "10 Pcs", weight: "1.600kg" }
    ],
  },
  // --- LOCKS ---
  {
    id: "lock-pad-china",
    name: "China Pad Lock",
    category: "Locks",
    image: "https://placehold.co/100x100.png?text=Lock",
    variants: [
      { id: "pl-20", size: "20mm", finish: "Standard" },
      { id: "pl-25", size: "25mm", finish: "Standard" },
      { id: "pl-32", size: "32mm", finish: "Standard" },
      { id: "pl-50", size: "50mm", finish: "Standard" },
      { id: "pl-63", size: "63mm", finish: "Standard" },
    ],
  },
  // --- SCREWS ---
  {
    id: "screw-gypsum",
    name: "Gypsum Screw (Black)",
    category: "Screws",
    image: "https://placehold.co/100x100.png?text=Screw",
    variants: [
      { id: "gs-19", size: "6 x 19mm", packSize: "800 pcs" },
      { id: "gs-25", size: "6 x 25mm", packSize: "700 pcs" },
      { id: "gs-35", size: "6 x 35mm", packSize: "500 pcs" },
      { id: "gs-50", size: "6 x 50mm", packSize: "400 pcs" },
    ],
  },
   // --- DOOR KITS ---
   {
    id: "door-kit-antic",
    name: "S.S. Door Kit (Antic)",
    category: "Door Kits",
    image: "https://placehold.co/100x100.png?text=Kit",
    variants: [
      { id: "dk-2l", size: "3mm", finish: "2 Line Pattern" },
      { id: "dk-4l", size: "3mm", finish: "4 Line Pattern" },
      { id: "dk-fl", size: "3mm", finish: "Flower Pattern" },
      { id: "dk-pc", size: "3mm", finish: "Peacock Pattern" },
    ],
  }
];

export type Client = {
  id: string;
  shopName: string;
  ownerName: string; 
  city: string;
  phone: string;
};

export const CLIENTS: Client[] = [
  { 
    id: "c1", 
    shopName: "Ganesh Hardware", 
    ownerName: "Ramesh Ji", 
    city: "Pune", 
    phone: "9921015227" 
  },
  { 
    id: "c2", 
    shopName: "City Fittings", 
    ownerName: "Ali Bhai", 
    city: "Mumbai", 
    phone: "9822668345" 
  },
  { 
    id: "c3", 
    shopName: "Royal Traders", 
    ownerName: "Burhanuddin", 
    city: "Nashik", 
    phone: "7588553110" 
  },
];