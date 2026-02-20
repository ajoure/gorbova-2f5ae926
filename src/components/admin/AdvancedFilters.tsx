import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Filter, X, Plus, SlidersHorizontal } from "lucide-react";

export interface FilterField {
  key: string;
  label: string;
  type: "text" | "select" | "number" | "date" | "boolean";
  options?: { value: string; label: string }[];
}

export interface ActiveFilter {
  field: string;
  operator: "contains" | "equals" | "gt" | "lt" | "gte" | "lte" | "not_empty" | "empty";
  value: string;
}

interface AdvancedFiltersProps {
  fields: FilterField[];
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
}

const OPERATORS = {
  text: [
    { value: "contains", label: "содержит" },
    { value: "equals", label: "равно" },
    { value: "not_empty", label: "не пусто" },
    { value: "empty", label: "пусто" },
  ],
  select: [
    { value: "equals", label: "равно" },
    { value: "not_empty", label: "не пусто" },
    { value: "empty", label: "пусто" },
  ],
  number: [
    { value: "equals", label: "равно" },
    { value: "gt", label: "больше" },
    { value: "lt", label: "меньше" },
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
  ],
  date: [
    { value: "equals", label: "равно" },
    { value: "gt", label: "после" },
    { value: "lt", label: "до" },
    { value: "not_empty", label: "не пусто" },
    { value: "empty", label: "пусто" },
  ],
  boolean: [
    { value: "equals", label: "равно" },
  ],
};

export function AdvancedFilters({ fields, filters, onFiltersChange }: AdvancedFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newFilter, setNewFilter] = useState<Partial<ActiveFilter>>({});

  const getFieldByKey = (key: string) => fields.find(f => f.key === key);

  const addFilter = () => {
    if (newFilter.field && newFilter.operator) {
      const field = getFieldByKey(newFilter.field);
      const needsValue = !["empty", "not_empty"].includes(newFilter.operator);
      
      if (!needsValue || newFilter.value) {
        onFiltersChange([
          ...filters,
          { 
            field: newFilter.field, 
            operator: newFilter.operator as ActiveFilter["operator"], 
            value: newFilter.value || "" 
          }
        ]);
        setNewFilter({});
      }
    }
  };

  const removeFilter = (index: number) => {
    onFiltersChange(filters.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    onFiltersChange([]);
  };

  const getFilterLabel = (filter: ActiveFilter) => {
    const field = getFieldByKey(filter.field);
    const operators = OPERATORS[field?.type || "text"];
    const op = operators.find(o => o.value === filter.operator);
    
    let valueLabel = filter.value;
    if (field?.type === "select" && field.options) {
      valueLabel = field.options.find(o => o.value === filter.value)?.label || filter.value;
    }
    if (filter.operator === "empty") valueLabel = "";
    if (filter.operator === "not_empty") valueLabel = "";
    
    return `${field?.label || filter.field} ${op?.label || filter.operator}${valueLabel ? ` "${valueLabel}"` : ""}`;
  };

  const selectedField = getFieldByKey(newFilter.field || "");
  const availableOperators = OPERATORS[selectedField?.type || "text"];
  const needsValue = !["empty", "not_empty"].includes(newFilter.operator || "");

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Фильтры
            {filters.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {filters.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-4" align="start">
          <div className="space-y-4">
            <div className="font-medium flex items-center justify-between">
              <span>Добавить фильтр</span>
              {filters.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 text-xs">
                  Сбросить все
                </Button>
              )}
            </div>
            
            <div className="flex gap-2">
              <Select 
                value={newFilter.field || ""} 
                onValueChange={(v) => setNewFilter({ field: v, operator: undefined, value: undefined })}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Поле" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map(f => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select 
                value={newFilter.operator || ""} 
                onValueChange={(v) => setNewFilter({ ...newFilter, operator: v as any })}
                disabled={!newFilter.field}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Условие" />
                </SelectTrigger>
                <SelectContent>
                  {availableOperators.map(op => (
                    <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {newFilter.field && newFilter.operator && needsValue && (
              <div>
                {selectedField?.type === "select" && selectedField.options ? (
                  <Select 
                    value={newFilter.value || ""} 
                    onValueChange={(v) => setNewFilter({ ...newFilter, value: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Значение" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedField.options.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : selectedField?.type === "boolean" ? (
                  <Select 
                    value={newFilter.value || ""} 
                    onValueChange={(v) => setNewFilter({ ...newFilter, value: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Значение" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Да</SelectItem>
                      <SelectItem value="false">Нет</SelectItem>
                    </SelectContent>
                  </Select>
                ) : selectedField?.type === "date" ? (
                  <DatePicker
                    value={newFilter.value || ""}
                    onChange={(v) => setNewFilter({ ...newFilter, value: v })}
                    placeholder="Выбрать дату"
                  />
                ) : selectedField?.type === "number" ? (
                  <Input
                    type="number"
                    placeholder="Значение"
                    value={newFilter.value || ""}
                    onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                  />
                ) : (
                  <Input
                    placeholder="Значение"
                    value={newFilter.value || ""}
                    onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                  />
                )}
              </div>
            )}
            
            <Button 
              onClick={addFilter} 
              disabled={!newFilter.field || !newFilter.operator || (needsValue && !newFilter.value)}
              className="w-full"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Добавить
            </Button>
            
            {filters.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <div className="text-sm text-muted-foreground">Активные фильтры:</div>
                {filters.map((filter, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                    <span className="flex-1 truncate">{getFilterLabel(filter)}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-5 w-5" 
                      onClick={() => removeFilter(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      
      {/* Display active filters as badges */}
      {filters.map((filter, index) => (
        <Badge 
          key={index} 
          variant="secondary" 
          className="gap-1 cursor-pointer hover:bg-destructive/20"
          onClick={() => removeFilter(index)}
        >
          {getFilterLabel(filter)}
          <X className="h-3 w-3" />
        </Badge>
      ))}
    </div>
  );
}

// Helper function to apply filters to data
export function applyFilters<T extends Record<string, any>>(
  data: T[],
  filters: ActiveFilter[],
  getFieldValue: (item: T, fieldKey: string) => any
): T[] {
  if (filters.length === 0) return data;
  
  return data.filter(item => {
    return filters.every(filter => {
      const value = getFieldValue(item, filter.field);
      const filterValue = filter.value?.toLowerCase();
      
      switch (filter.operator) {
        case "contains":
          return String(value || "").toLowerCase().includes(filterValue || "");
        case "equals":
          if (typeof value === "boolean") {
            return value === (filter.value === "true");
          }
          return String(value || "").toLowerCase() === filterValue;
        case "gt":
          return Number(value) > Number(filter.value);
        case "lt":
          return Number(value) < Number(filter.value);
        case "gte":
          return Number(value) >= Number(filter.value);
        case "lte":
          return Number(value) <= Number(filter.value);
        case "not_empty":
          return value !== null && value !== undefined && value !== "";
        case "empty":
          return value === null || value === undefined || value === "";
        default:
          return true;
      }
    });
  });
}
