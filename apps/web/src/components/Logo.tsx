import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  /** Use 'light' variant on dark backgrounds (white text). Default uses dark text for light backgrounds. */
  variant?: 'default' | 'light';
  /** Set to false to render without a Link wrapper (e.g. when already inside a Link). */
  asLink?: boolean;
  className?: string;
}

const sizes = {
  sm: { width: 120, height: 28 },
  md: { width: 155, height: 36 },
  lg: { width: 190, height: 44 },
};

export function Logo({ size = 'md', variant = 'default', asLink = true, className }: LogoProps) {
  const sizeConfig = sizes[size];
  // Use SVG logos - logo.svg for light backgrounds, logo.light.svg for dark backgrounds
  // In dark mode (variant='light'), we use the white text version
  const src = variant === 'light' ? '/logo.light.svg' : '/logo.svg';

  const image = (
    <>
      {/* Show appropriate logo based on variant or auto-detect from dark mode */}
      <Image
        src="/logo.svg"
        alt="SquadX Live"
        width={sizeConfig.width}
        height={sizeConfig.height}
        className={cn('h-auto', variant === 'light' ? 'hidden' : 'dark:hidden')}
        style={{ height: sizeConfig.height }}
        priority
      />
      <Image
        src="/logo.light.svg"
        alt="SquadX Live"
        width={sizeConfig.width}
        height={sizeConfig.height}
        className={cn('h-auto', variant === 'light' ? '' : 'hidden dark:block')}
        style={{ height: sizeConfig.height }}
        priority
      />
    </>
  );

  if (!asLink) {
    return <span className={cn('flex items-center', className)}>{image}</span>;
  }

  return (
    <Link href="/" className={cn('flex items-center', className)}>
      {image}
    </Link>
  );
}
