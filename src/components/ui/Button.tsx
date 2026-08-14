import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'md' | 'lg'
}

const VARIANTS = {
  primary: 'bg-accent text-white active:brightness-90',
  ghost: 'bg-surface text-fg border border-border active:bg-border',
  danger: 'bg-transparent text-accent border border-accent active:bg-accent/10',
} as const

const SIZES = {
  md: 'min-h-14 text-base px-5',
  lg: 'min-h-16 text-xl px-6',
} as const

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      {...rest}
      className={`w-full rounded-xl font-semibold tracking-wide transition-[filter] duration-75 disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  )
}
