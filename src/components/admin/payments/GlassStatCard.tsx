 import { ReactNode } from "react";
 import { cn } from "@/lib/utils";
 
 export type GlassStatVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';
 
 interface GlassStatCardProps {
   title: string;
   value: string;
   subtitle?: string;
   icon: ReactNode;
   variant?: GlassStatVariant;
   isActive?: boolean;
   isClickable?: boolean;
   onClick?: () => void;
 }
 
 const variantColors: Record<GlassStatVariant, { text: string; iconBg: string }> = {
   default: { text: 'text-foreground/90', iconBg: 'bg-white/20' },
   success: { text: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-500/15' },
   warning: { text: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-500/15' },
   danger: { text: 'text-rose-600 dark:text-rose-400', iconBg: 'bg-rose-500/15' },
   info: { text: 'text-sky-600 dark:text-sky-400', iconBg: 'bg-sky-500/15' },
 };
 
 export function GlassStatCard({
   title,
   value,
   subtitle,
   icon,
   variant = 'default',
   isActive = false,
   isClickable = true,
   onClick,
 }: GlassStatCardProps) {
   const colors = variantColors[variant];
 
   return (
     <div
       onClick={onClick}
       className={cn(
         // Base glass effect
         "relative overflow-hidden rounded-2xl p-4",
         "backdrop-blur-xl",
         // Light: more transparent white, Dark: subtle
         "bg-white/50 dark:bg-white/[0.06]",
         "border border-white/60 dark:border-white/[0.12]",
         "shadow-[0_4px_24px_rgba(0,0,0,0.03)]",
         "transition-all duration-300",
         // Hover & active states
         isClickable && "cursor-pointer hover:bg-white/60 dark:hover:bg-white/[0.08] hover:border-white/70 hover:scale-[1.02]",
         isActive && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background"
       )}
     >
       {/* Inner shine overlay */}
       <div 
         className="absolute inset-0 rounded-2xl pointer-events-none"
         style={{
           background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 60%)',
         }}
       />
       
       {/* Top accent line */}
       <div 
         className="absolute inset-x-0 top-0 h-px opacity-60"
         style={{
           background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
         }}
       />
 
       {/* Content */}
       <div className="relative z-10 flex items-start justify-between gap-3">
         <div className="flex-1 min-w-0 space-y-1">
           <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
             {title}
           </p>
           <p className={cn("text-xl font-medium tabular-nums tracking-tight", colors.text)}>
             {value}
           </p>
           {subtitle && (
             <p className="text-xs text-muted-foreground tabular-nums">
               {subtitle}
             </p>
           )}
         </div>
         <div className={cn("shrink-0 p-2 rounded-xl", colors.iconBg)}>
           {icon}
         </div>
       </div>
 
       {/* Active indicator */}
       {isActive && (
         <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary animate-pulse" />
       )}
     </div>
   );
 }