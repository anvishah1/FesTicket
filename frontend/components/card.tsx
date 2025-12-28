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
        bg-white border border-gray-200 rounded-lg overflow-hidden
        transition-all duration-200 cursor-pointer
        hover:shadow-xl hover:-translate-y-1
        flex flex-col
      "
    >
      {/* Image */}
      {image && (
        <div className="relative w-full h-80 bg-gray-100 overflow-hidden">
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {/* Hover Overlay */}
          {hoverText && (
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <span className="text-white text-lg font-bold tracking-wide px-6 py-3 border-2 border-white rounded-full hover:bg-white hover:text-black transition-colors duration-200">
                {hoverText}
              </span>
            </div>
          )}
        </div>
      )}
      
      {/* Content */}
      <div className="p-5 flex flex-col flex-grow">
        <h2 className="text-base font-semibold text-gray-900 mb-1 line-clamp-2">
          {title}
        </h2>
        
        {subtitle && (
          <p className="text-sm text-blue-600 mb-2">{subtitle}</p>
        )}
        
        {description && (
          <p className="text-sm text-gray-500 line-clamp-2">{description}</p>
        )}
      </div>
    </div>
  );
}
