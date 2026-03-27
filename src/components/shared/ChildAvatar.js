import React from 'react';
import { isDragonAvatar, getDragonSrc } from '../../data/dragonAvatars';

export default function ChildAvatar({ emoji, size = 'md', className = '' }) {
  const sizes = { xs: 'w-5 h-5 text-sm', sm: 'w-7 h-7 text-base', md: 'w-9 h-9 text-lg', lg: 'w-12 h-12 text-2xl', xl: 'w-16 h-16 text-3xl' };
  const sizeClass = sizes[size] || sizes.md;

  if (isDragonAvatar(emoji)) {
    return (
      <img
        src={getDragonSrc(emoji)}
        alt="Dragon avatar"
        className={`${sizeClass} rounded-full object-cover ${className}`}
        draggable={false}
      />
    );
  }

  return (
    <span className={`${sizeClass} flex items-center justify-center ${className}`}>
      {emoji || '\u{1F409}'}
    </span>
  );
}
