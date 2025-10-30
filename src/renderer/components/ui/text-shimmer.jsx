import React from 'react';

const TextShimmer = ({
  children,
  as: Component = 'p',
  className = '',
  duration = 2,
  spread = 2,
  ...props
}) => {
  return (
    <Component
      className={className}
      style={{
        '--spread': spread,
        '--duration': `${duration}s`,
        '--base-color': 'rgba(55, 65, 81, 1)',
        '--base-gradient-color': 'rgba(209, 213, 219, 1)',
      }}
      {...props}
    >
      <span
        className="inline-block bg-clip-text text-transparent bg-[linear-gradient(110deg,var(--base-color)_0%,var(--base-color)_calc(50%-var(--spread)*1rem),var(--base-gradient-color)_50%,var(--base-color)_calc(50%+var(--spread)*1rem),var(--base-color)_100%)] bg-[length:250%_100%] animate-shimmer"
        style={{
          backgroundImage:
            'linear-gradient(110deg, var(--base-color) 0%, var(--base-color) calc(50% - var(--spread) * 1rem), var(--base-gradient-color) 50%, var(--base-color) calc(50% + var(--spread) * 1rem), var(--base-color) 100%)',
          backgroundSize: '250% 100%',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          animation: `shimmer var(--duration) infinite`,
        }}
      >
        {children}
      </span>
    </Component>
  );
};

export { TextShimmer };

