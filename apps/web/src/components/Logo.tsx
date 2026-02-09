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

  // Determine which logo to show based on variant
  // variant='default': show dark text logo (for light backgrounds)
  // variant='light': show white text logo (for dark backgrounds)
  const logoSrc = variant === 'light' ? '/logo-dark-bg.png' : '/logo-light-bg.png';
  const iconSrc = '/logo.png';

  const content = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconOnly ? iconSrc : logoSrc}
      alt="SquadX Live"
      style={{ height: sizeConfig.height, width: 'auto' }}
    />
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
