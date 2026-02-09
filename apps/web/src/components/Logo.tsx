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
  sm: { height: 32 },
  md: { height: 40 },
  lg: { height: 50 },
};

export function Logo({ size = 'md', variant = 'default', asLink = true, iconOnly = false, className }: LogoProps) {
  const sizeConfig = sizes[size];

  const content = iconOnly ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="SquadX Live"
      style={{ height: sizeConfig.height, width: 'auto' }}
    />
  ) : (
    <span className={cn('flex items-center', className)}>
      {/* Logo for light backgrounds (visible in light mode) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-light-bg.png"
        alt="SquadX Live"
        className={cn(variant === 'light' ? 'hidden' : 'dark:hidden')}
        style={{ height: sizeConfig.height, width: 'auto' }}
      />
      {/* Logo for dark backgrounds (visible in dark mode or when variant='light') */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-dark-bg.png"
        alt="SquadX Live"
        className={cn(variant === 'light' ? 'block' : 'hidden dark:block')}
        style={{ height: sizeConfig.height, width: 'auto' }}
      />
    </span>
  );

  if (!asLink) {
    return <span className={cn('flex items-center', className)}>{content}</span>;
  }

  return (
    <Link href="/" className={cn('flex items-center', className)}>
      {content}
    </Link>
  );
}
