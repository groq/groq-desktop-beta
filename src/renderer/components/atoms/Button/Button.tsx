import React from 'react';
import styles from './Button.module.css';
import cn from 'classnames';

export type ButtonSize = 'small' | 'medium' | 'large';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  isFullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'medium',
  isLoading = false,
  isFullWidth = false,
  leftIcon,
  rightIcon,
  className,
  disabled,
  ...props
}) => {
  const hasIcon = leftIcon || rightIcon;

  return (
    <button
      className={cn({
        [styles.button]: true,
        [styles[variant]]: true, 
        [styles[size]]: true,
        [styles.withIcon]: hasIcon,
        [styles.loading]: isLoading,
        [styles.fullWidth]: isFullWidth,
        [className || '']: !!className
      })}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <span className={styles.spinner} />}
      <span className={styles.content}>
        {leftIcon && <span className={styles.icon}>{leftIcon}</span>}
        {children}
        {rightIcon && <span className={styles.icon}>{rightIcon}</span>}
      </span>
    </button>
  );
};

export default Button; 