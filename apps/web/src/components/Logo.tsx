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
  sm: { width: 140, height: 32 },
  md: { width: 180, height: 40 },
  lg: { width: 220, height: 50 },
};

export function Logo({ size = 'md', variant = 'default', asLink = true, iconOnly = false, className }: LogoProps) {
  const sizeConfig = sizes[size];

  const content = iconOnly ? (
    <Image
      src="/logo.png"
      alt="SquadX Live"
      width={sizeConfig.height}
      height={sizeConfig.height}
      className="h-auto"
      style={{ height: sizeConfig.height, width: sizeConfig.height }}
      priority
    />
  ) : (
    <span className={cn('flex items-center', className)}>
      {/* Logo for light backgrounds (visible in light mode) */}
      <Image
        src="/logo-light-bg.png"
        alt="SquadX Live"
        width={sizeConfig.width}
        height={sizeConfig.height}
        className={cn('h-auto', variant === 'light' ? 'hidden' : 'dark:hidden')}
        style={{ height: sizeConfig.height }}
        priority
      />
      {/* Logo for dark backgrounds (visible in dark mode or when variant='light') */}
      <Image
        src="/logo-dark-bg.png"
        alt="SquadX Live"
        width={sizeConfig.width}
        height={sizeConfig.height}
        className={cn('h-auto', variant === 'light' ? 'block' : 'hidden dark:block')}
        style={{ height: sizeConfig.height }}
        priority
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
