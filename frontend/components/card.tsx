"use client";

import React from "react";

interface CardProps {
  title: string;
  description?: string;
  image?: string;
  subtitle?: string;
  onClick?: () => void;
  hoverText?: string; // Optional hover overlay text (e.g., "Register Now")
}

export default function Card({ title, description, image, subtitle, onClick, hoverText }: CardProps) {
  return (
    <div
      onClick={onClick}
      className="
        group relative
        bg-white border border-[#C5BAC4] rounded-xl overflow-hidden
        transition-all duration-200 cursor-pointer
        hover:shadow-lg hover:-translate-y-1
        flex flex-col
      "
    >
      {/* Image */}
      {image && (
        <div className="relative w-full h-80 bg-[#C5BAC4]/20 overflow-hidden">
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {/* Hover Overlay */}
          {hoverText && (
            <div className="absolute inset-0 bg-[#29104A]/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <span className="text-white text-lg font-bold tracking-wide px-6 py-3 border-2 border-white rounded-full hover:bg-white hover:text-[#29104A] transition-colors duration-200">
                {hoverText}
              </span>
            </div>
          )}
        </div>
      )}
      
      {/* Content */}
      <div className="p-5 flex flex-col flex-grow">
        <h2 className="text-base font-semibold text-[#29104A] mb-1 line-clamp-2">
          {title}
        </h2>
        
        {subtitle && (
          <p className="text-sm text-[#522C5D] mb-2">{subtitle}</p>
        )}
        
        {description && (
          <p className="text-sm text-[#6B597F] line-clamp-2">{description}</p>
        )}
      </div>
    </div>
  );
}
