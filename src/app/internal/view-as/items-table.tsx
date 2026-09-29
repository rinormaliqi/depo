type Item = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unitOfMeasure: string;
  minStockLevel: number | null;
  inStock: number;
};

// Read-only by construction — no edit/delete affordance exists on this
// page at all, unlike the real /items which renders a full CRUD form per
// row. There's nothing here for a bypassed readOnly flag to exploit.
export function ItemsTable({ items }: { items: Item[] }) {
  if (items.length === 0) return <p className="text-muted" style={{ fontSize: 13 }}>No items yet.</p>;

  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "color-mix(in srgb,var(--color-text) 55%,transparent)", paddingBottom: 6, borderBottom: "1px solid var(--color-divider)" }}>
        <span>Item</span>
        <span>SKU</span>
        <span>Category</span>
        <span>In stock</span>
        <span>Min level</span>
      </div>
      {items.map((item) => (
        <div key={item.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--color-divider)" }}>
          <span>{item.name}</span>
          <span className="text-muted">{item.sku ?? "—"}</span>
          <span className="text-muted">{item.category ?? "—"}</span>
          <span style={item.minStockLevel !== null && item.inStock < item.minStockLevel ? { color: "var(--color-danger-700)" } : undefined}>
            {item.inStock} {item.unitOfMeasure}
          </span>
          <span className="text-muted">{item.minStockLevel ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}
