// Small labeled number input that swallows NaN. Used throughout the sidebar
// for position/size/count/etc. fields.
export function NumField({ label, value, onChange }) {
  return (
    <label className="sidebar__field">
      <span className="sidebar__field-label">{label}</span>
      <input
        className="sidebar__field-input"
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </label>
  );
}
