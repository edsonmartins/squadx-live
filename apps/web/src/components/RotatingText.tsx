'use client';

import { TypeAnimation } from 'react-type-animation';

const sequence = [
  'Program',
  2000,
  'Pitch',
  2000,
  'Present',
  2000,
  'Demo',
  2000,
  'Design',
  2000,
  'Debug',
  2000,
  'Teach',
  2000,
  'Train',
  2000,
  'Review',
  2000,
  'Brainstorm',
  2000,
];

export function RotatingText() {
  return (
    <TypeAnimation
      sequence={sequence}
      wrapper="span"
      speed={50}
      deletionSpeed={40}
      repeat={Infinity}
      className="from-primary-600 via-accent-500 to-primary-600 animate-gradient-x bg-gradient-to-r bg-[length:200%_auto] bg-clip-text text-transparent"
      cursor={true}
    />
  );
}
