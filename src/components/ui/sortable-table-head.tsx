import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { TableHead } from "./table";

export type SortDirection = "asc" | "desc" | null;

interface SortableTableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortKey: string;
  currentSortKey: string | null;
  currentSortDirection: SortDirection;
  onSort: (key: string) => void;
  children: React.ReactNode;
}

export const SortableTableHead = React.forwardRef<
  HTMLTableCellElement,
  SortableTableHeadProps
>(({ className, sortKey, currentSortKey, currentSortDirection, onSort, children, ...props }, ref) => {
  const isActive = currentSortKey === sortKey;
  
  return (
    <TableHead
      ref={ref}
      className={cn(
        "cursor-pointer select-none hover:bg-muted/50 transition-colors",
        isActive && "text-foreground",
        className
      )}
      onClick={() => onSort(sortKey)}
      {...props}
    >
      <div className="flex items-center gap-1">
        {children}
        {isActive ? (
          currentSortDirection === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
        )}
      </div>
    </TableHead>
  );
});

SortableTableHead.displayName = "SortableTableHead";
