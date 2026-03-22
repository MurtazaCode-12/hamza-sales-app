"use client";
import React, { useState } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type Hotspot = {
  id: string;
  top: number; // percentage
  left: number; // percentage
  title: string;
  description: string;
  imageSrc: string;
  price?: string;
};

interface HotspotImageProps {
  backgroundImage: string;
  hotspots: Hotspot[];
}

export default function HotspotImage({ backgroundImage, hotspots }: HotspotImageProps) {
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null);

  return (
    <div className="relative w-full aspect-[16/9] md:aspect-[21/9] overflow-hidden rounded-2xl bg-zinc-100 group shadow-sm border border-slate-100">
      <Image 
        src={backgroundImage} 
        alt="Hotspot interactive backdrop" 
        fill 
        className="object-cover transition-transform duration-1000 ease-out group-hover:scale-[1.03]" 
        priority 
      />
      
      {hotspots.map((hotspot) => (
        <Dialog key={hotspot.id} onOpenChange={(open: boolean) => !open && setActiveHotspot(null)}>
          <DialogTrigger asChild>
            <button
              onClick={() => setActiveHotspot(hotspot)}
              className="absolute z-10 w-8 h-8 -ml-4 -mt-4 bg-white/90 backdrop-blur-md rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.1)] flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-110 hover:bg-white"
              style={{ top: `${hotspot.top}%`, left: `${hotspot.left}%` }}
              aria-label={`View details for ${hotspot.title}`}
            >
              <span className="w-2.5 h-2.5 bg-[#4A2B1D] rounded-full animate-pulse" />
              <div className="absolute w-12 h-12 border border-white/60 rounded-full animate-ping pointer-events-none" style={{ animationDuration: '2s' }} />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-md bg-white border-0 shadow-2xl rounded-2xl p-0 overflow-hidden">
            <div className="relative w-full h-72 bg-[#F9F9F9] border-b border-slate-100 select-none">
               <Image 
                 src={hotspot.imageSrc} 
                 alt={hotspot.title} 
                 fill 
                 className="object-contain p-6 hover:scale-105 transition-transform duration-500" 
               />
            </div>
            <div className="p-6">
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl text-slate-900">{hotspot.title}</DialogTitle>
                <DialogDescription className="text-sm mt-3 text-slate-500 leading-relaxed">
                  {hotspot.description}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-between items-center mt-8 pt-6 border-t border-slate-100">
                <div className="flex flex-col">
                  {hotspot.price && <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pricing</span>}
                  <span className="text-lg font-serif font-bold text-slate-900">{hotspot.price || 'Price on Request'}</span>
                </div>
                <Button className="bg-[#4A2B1D] hover:bg-[#321C10] text-white px-6 h-12 rounded-xl text-sm font-bold shadow-lg shadow-[#4A2B1D]/20 transition-all active:scale-[0.98]">
                  Enquire Now
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
