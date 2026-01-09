import { useState, useMemo, useCallback } from "react";
import { SortDirection } from "@/components/ui/sortable-table-head";

interface UseTableSortOptions<T> {
  data: T[];
  defaultSortKey?: string | null;
  defaultSortDirection?: SortDirection;
  getFieldValue?: (item: T, key: string) => any;
}

export function useTableSort<T>({
  data,
  defaultSortKey = null,
  defaultSortDirection = null,
  getFieldValue,
}: UseTableSortOptions<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      // Toggle direction: asc -> desc -> null
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortKey(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }, [sortKey, sortDirection]);

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) {
      return data;
    }

    return [...data].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (getFieldValue) {
        aValue = getFieldValue(a, sortKey);
        bValue = getFieldValue(b, sortKey);
      } else {
        aValue = (a as any)[sortKey];
        bValue = (b as any)[sortKey];
      }

      // Handle null/undefined
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return sortDirection === "asc" ? 1 : -1;
      if (bValue == null) return sortDirection === "asc" ? -1 : 1;

      // Handle different types
      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }

      if (aValue instanceof Date && bValue instanceof Date) {
        return sortDirection === "asc" 
          ? aValue.getTime() - bValue.getTime() 
          : bValue.getTime() - aValue.getTime();
      }

      // Handle date strings
      if (typeof aValue === "string" && typeof bValue === "string") {
        const aDate = Date.parse(aValue);
        const bDate = Date.parse(bValue);
        if (!isNaN(aDate) && !isNaN(bDate)) {
          return sortDirection === "asc" ? aDate - bDate : bDate - aDate;
        }
      }

      // Default string comparison
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      
      if (sortDirection === "asc") {
        return aStr.localeCompare(bStr, "ru");
      } else {
        return bStr.localeCompare(aStr, "ru");
      }
    });
  }, [data, sortKey, sortDirection, getFieldValue]);

  return {
    sortedData,
    sortKey,
    sortDirection,
    handleSort,
    setSortKey,
    setSortDirection,
  };
}
