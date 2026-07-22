// Operators offered in the per-column filter popover, in display order.
export const FILTER_OPS: { op: FilterOp; label: string; noValue?: boolean }[] = [
  { op: "=", label: "equals" },
  { op: "!=", label: "not equals" },
  { op: ">", label: "greater than" },
  { op: ">=", label: "greater or equal" },
  { op: "<", label: "less than" },
  { op: "<=", label: "less or equal" },
  { op: "contains", label: "contains" },
  { op: "starts", label: "starts with" },
  { op: "ends", label: "ends with" },
  { op: "isnull", label: "is null", noValue: true },
  { op: "notnull", label: "is not null", noValue: true },
];

export const NO_VALUE_OPS = new Set<FilterOp>(["isnull", "notnull"]);
