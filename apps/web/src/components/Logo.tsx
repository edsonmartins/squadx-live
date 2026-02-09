import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  /** Use 'light' variant on dark backgrounds (white text). Default uses dark text for light backgrounds. */
  variant?: 'default' | 'light';
  /** Set to false to render without a Link wrapper (e.g. when already inside a Link). */
  asLink?: boolean;
  /** Show only the icon without text */
  iconOnly?: boolean;
  className?: string;
}

const sizes = {
  sm: { iconSize: 28, textSize: 'text-lg' },
  md: { iconSize: 36, textSize: 'text-xl' },
  lg: { iconSize: 44, textSize: 'text-2xl' },
};

export function Logo({ size = 'md', variant = 'default', asLink = true, iconOnly = false, className }: LogoProps) {
  const sizeConfig = sizes[size];

  const content = (
    <span className={cn('flex items-center gap-2', className)}>
      {/* Icon */}
      <Image
        src="/logo.png"
        alt="SquadX Live"
        width={sizeConfig.iconSize}
        height={sizeConfig.iconSize}
        className="h-auto"
        style={{ height: sizeConfig.iconSize, width: sizeConfig.iconSize }}
        priority
      />
      {/* Text */}
      {!iconOnly && (
        <span
          className={cn(
            'font-bold tracking-tight',
            sizeConfig.textSize,
            variant === 'light' ? 'text-white' : 'text-gray-900 dark:text-white'
          )}
        >
          SquadX <span className="text-indigo-600 dark:text-indigo-400">Live</span>
        </span>
      )}
    </span>
  );

  if (!asLink) {
    return content;
  }

  return (
    <Link href="/" className="flex items-center">
      {content}
    </Link>
  );
}
