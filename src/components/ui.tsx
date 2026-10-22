import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { LoaderCircle } from 'lucide-react'
export function Button({ children, variant = 'primary', className = '', ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'danger' }>) { return <button className={`btn btn-${variant} inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition-colors focus-visible:outline-2 ${className}`} {...props}>{children}</button> }
export function Card({ children, className = '', ...props }: PropsWithChildren<React.HTMLAttributes<HTMLElement>>) { return <section className={`card rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm ${className}`} {...props}>{children}</section> }
export function Badge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'green' | 'orange' }>) { return <span className={`badge badge-${tone} inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold`}>{children}</span> }
export function Spinner() { return <LoaderCircle className="spin" aria-label="Loading" size={21} /> }
